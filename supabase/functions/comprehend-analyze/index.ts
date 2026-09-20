// =============================================================================
// TRACIFY — comprehend-analyze Edge Function
//
// Runs Amazon Comprehend NLP over a finding's description and stores:
//   • detected PII entities        (DetectPiiEntities)
//   • detected general entities     (DetectEntities)  — PERSON, ORG, LOCATION…
//   • dominant sentiment + scores  (DetectSentiment)
//   • detected language            (DetectDominantLanguage)
//
// Request:
//   POST { finding_id: string }
//   Authorization: Bearer <user-jwt>
//
// Response:
//   { status: "analysed",
//     language: "en",
//     entities:  Entity[],
//     pii:       PiiEntity[],
//     sentiment: "NEGATIVE",
//     sentimentScores: { Positive, Negative, Neutral, Mixed } }
//
// Reuses the same AWS_* Edge Function secrets as s3-presign and
// textract-evidence. No new secrets required.
// =============================================================================

import { AwsClient } from "aws4fetch";
import { createClient } from "@supabase/supabase-js";

const AWS_ACCESS_KEY_ID     = Deno.env.get("AWS_ACCESS_KEY_ID")     ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_REGION            = Deno.env.get("AWS_REGION")            ?? "ap-south-1";
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")          ?? "";
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")     ?? "";

// Comprehend hard-limits input text to 5000 UTF-8 bytes per sync call
const MAX_BYTES = 5000;
// Comprehend supported languages for entity + sentiment (subset we care about)
const SUPPORTED_LANGUAGES = new Set([
  "en", "es", "fr", "de", "it", "pt", "ar", "hi", "ja", "ko", "zh", "zh-TW",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age":       "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
function bad(message: string, status = 400) {
  return json({ error: message }, status);
}

function truncateUtf8(text: string, maxBytes: number): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  if (bytes.length <= maxBytes) return text;
  // truncate to maxBytes then re-decode (drop trailing partial char)
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, maxBytes));
}

// ---------- Comprehend RPC helper ----------
async function comprehend<T>(
  aws: AwsClient,
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const resp = await aws.fetch(
    `https://comprehend.${AWS_REGION}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-amz-json-1.1",
        "X-Amz-Target":  `Comprehend_20171127.${action}`,
      },
      body: JSON.stringify(payload),
      aws: { service: "comprehend", region: AWS_REGION },
    },
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Comprehend ${action} ${resp.status}: ${t.slice(0, 300)}`);
  }
  return (await resp.json()) as T;
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return bad("method not allowed", 405);

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return bad("AWS env not configured", 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return bad("missing bearer token", 401);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return bad("unauthenticated", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid JSON body"); }
  const findingId = String(body.finding_id ?? "");
  if (!findingId) return bad("finding_id is required");

  // fetch the finding (RLS-scoped: caller must be able to SELECT it)
  const { data: finding, error: fErr } = await supabase
    .from("findings")
    .select("id, title, description")
    .eq("id", findingId)
    .maybeSingle();
  if (fErr) return bad(fErr.message, 500);
  if (!finding) return bad("finding not found or access denied", 404);

  // combine title + description so we get more signal even from short findings
  const text = truncateUtf8(
    [finding.title, finding.description].filter(Boolean).join(". "),
    MAX_BYTES,
  );
  if (!text.trim()) return bad("finding has no text to analyse", 422);

  await supabase.from("findings")
    .update({ nlp_status: "analysing", nlp_error: null })
    .eq("id", findingId);

  const aws = new AwsClient({
    accessKeyId:     AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region:          AWS_REGION,
    service:         "comprehend",
  });

  try {
    // 1. Detect dominant language first — needed by DetectEntities/Sentiment
    const lang = await comprehend<{
      Languages: Array<{ LanguageCode: string; Score: number }>;
    }>(aws, "DetectDominantLanguage", { Text: text });
    const detected = lang.Languages?.[0]?.LanguageCode ?? "en";
    const languageCode = SUPPORTED_LANGUAGES.has(detected) ? detected : "en";

    // 2. Run all three analyses in parallel
    const [entities, pii, sentiment] = await Promise.all([
      comprehend<{
        Entities: Array<{
          Type: string; Text: string; Score: number;
          BeginOffset: number; EndOffset: number;
        }>;
      }>(aws, "DetectEntities", { Text: text, LanguageCode: languageCode }),

      // PII detection only supports English + Spanish today
      languageCode === "en" || languageCode === "es"
        ? comprehend<{
            Entities: Array<{
              Type: string; Score: number;
              BeginOffset: number; EndOffset: number;
            }>;
          }>(aws, "DetectPiiEntities", { Text: text, LanguageCode: languageCode })
        : Promise.resolve({ Entities: [] }),

      comprehend<{
        Sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";
        SentimentScore: {
          Positive: number; Negative: number; Neutral: number; Mixed: number;
        };
      }>(aws, "DetectSentiment", { Text: text, LanguageCode: languageCode }),
    ]);

    // Trim + dedupe entities so we don't store noise
    const compactEntities = (entities.Entities ?? [])
      .filter((e) => e.Score >= 0.7)
      .map((e) => ({
        type: e.Type,
        text: e.Text,
        score: Number(e.Score.toFixed(3)),
        begin: e.BeginOffset,
        end:   e.EndOffset,
      }))
      .slice(0, 50);

    const compactPii = (pii.Entities ?? [])
      .filter((p) => p.Score >= 0.5)
      .map((p) => ({
        type:  p.Type,
        score: Number(p.Score.toFixed(3)),
        begin: p.BeginOffset,
        end:   p.EndOffset,
      }))
      .slice(0, 50);

    await supabase.from("findings")
      .update({
        nlp_status:           "analysed",
        nlp_language:         languageCode,
        nlp_entities:         compactEntities as unknown as Record<string, unknown>,
        nlp_pii:              compactPii as unknown as Record<string, unknown>,
        nlp_sentiment:        sentiment.Sentiment,
        nlp_sentiment_scores: sentiment.SentimentScore as unknown as Record<string, unknown>,
        nlp_analysed_at:      new Date().toISOString(),
        nlp_error:            null,
      })
      .eq("id", findingId);

    return json({
      status:          "analysed",
      language:        languageCode,
      entities:        compactEntities,
      pii:             compactPii,
      sentiment:       sentiment.Sentiment,
      sentimentScores: sentiment.SentimentScore,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("findings")
      .update({
        nlp_status: "failed",
        nlp_error:  msg.slice(0, 500),
      })
      .eq("id", findingId);
    return bad(`analysis failed: ${msg}`, 500);
  }
});
