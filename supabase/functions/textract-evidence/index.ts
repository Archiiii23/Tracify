// =============================================================================
// TRACIFY — textract-evidence Edge Function
//
// Runs Amazon Textract over an S3-backed evidence file and writes the extracted
// text + structured entities (wallet addresses, tx hashes, amounts, dates) back
// onto the evidence row.
//
// Called from the frontend right after a successful S3 upload — the app already
// knows the evidence_id.
//
// Request:
//   POST { evidence_id: string }
//   Authorization: Bearer <user-jwt>
//
// Response:
//   { status: "extracted",
//     text_length: number,
//     entities: { walletAddresses[], txHashes[], amounts[], dates[] } }
//   or { status: "skipped", reason: string }
//   or { error: string }
//
// Required Edge Function secrets (same set as s3-presign — reuses IAM user):
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
// =============================================================================

import { AwsClient } from "aws4fetch";
import { createClient } from "@supabase/supabase-js";

// ---------- config ----------
const AWS_ACCESS_KEY_ID     = Deno.env.get("AWS_ACCESS_KEY_ID")     ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_REGION            = Deno.env.get("AWS_REGION")            ?? "ap-south-1";
const AWS_S3_BUCKET         = Deno.env.get("AWS_S3_BUCKET")         ?? "";
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")          ?? "";
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")     ?? "";

// Textract sync API supports these types
const EXTRACTABLE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "application/pdf", // single-page only via sync API
]);

const MAX_SYNC_SIZE_MB = 10;

// ---------- CORS ----------
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

// ---------- entity extraction (regex over the reconstructed text) ----------
const RX = {
  // 0x + 40 hex chars — matches Ethereum, Polygon, BSC, Arbitrum, Base wallets
  eth:  /\b0x[a-fA-F0-9]{40}\b/g,
  // 0x + 64 hex chars — EVM transaction hash
  txHash: /\b0x[a-fA-F0-9]{64}\b/g,
  // Legacy Bitcoin (P2PKH / P2SH) + bech32
  btc:  /\b(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,62})\b/g,
  // Tron addresses (base58, 34 chars, starts with T)
  tron: /\bT[A-HJ-NP-Za-km-z1-9]{33}\b/g,
  // Money-like strings: 1,234.56 USDT / $412,500 / 6.4 ETH
  amount: /(?:\$|₹|€|£)?\s?\d{1,3}(?:[,]\d{3})*(?:\.\d+)?\s?(?:USD|USDT|ETH|BTC|BNB|MATIC|TRX|SOL|INR|EUR|GBP)?\b/gi,
  // ISO dates + common formats
  date: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/g,
};

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

interface ExtractedEntities {
  walletAddresses: string[];
  txHashes:        string[];
  amounts:         string[];
  dates:           string[];
}

function extractEntities(text: string): ExtractedEntities {
  const wallets = [
    ...(text.match(RX.eth)  ?? []),
    ...(text.match(RX.btc)  ?? []),
    ...(text.match(RX.tron) ?? []),
  ];
  return {
    walletAddresses: uniq(wallets),
    txHashes:        uniq(text.match(RX.txHash) ?? []),
    amounts:         uniq((text.match(RX.amount) ?? []).map((s) => s.trim()).filter((s) => s.length >= 2)).slice(0, 30),
    dates:           uniq(text.match(RX.date) ?? []),
  };
}

// ---------- Textract call ----------
async function detectDocumentText(
  aws: AwsClient,
  bucket: string,
  key: string,
): Promise<string> {
  const endpoint = `https://textract.${AWS_REGION}.amazonaws.com/`;
  const body = JSON.stringify({
    Document: { S3Object: { Bucket: bucket, Name: key } },
  });

  const resp = await aws.fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-amz-json-1.1",
      "X-Amz-Target":  "Textract.DetectDocumentText",
    },
    body,
    aws: { service: "textract", region: AWS_REGION },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Textract ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  const blocks = (data.Blocks ?? []) as Array<{ BlockType: string; Text?: string }>;
  return blocks
    .filter((b) => b.BlockType === "LINE" && typeof b.Text === "string")
    .map((b) => b.Text!)
    .join("\n");
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return bad("method not allowed", 405);

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    return bad("AWS env not configured (missing AWS_* secrets)", 500);
  }

  // auth
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

  // body
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid JSON body"); }
  const evidenceId = String(body.evidence_id ?? "");
  if (!evidenceId) return bad("evidence_id is required");

  // fetch evidence row (RLS gate — caller must be able to SELECT it)
  const { data: ev, error: evErr } = await supabase
    .from("evidence")
    .select("id, s3_bucket, s3_key, mime_type, file_size, extraction_status")
    .eq("id", evidenceId)
    .maybeSingle();
  if (evErr) return bad(evErr.message, 500);
  if (!ev)   return bad("evidence not found or access denied", 404);
  if (!ev.s3_key || !ev.s3_bucket) return bad("this evidence is not S3-backed", 422);

  // skip non-extractable file types up-front
  if (!EXTRACTABLE_MIME.has(String(ev.mime_type ?? ""))) {
    await supabase.from("evidence")
      .update({
        extraction_status: "skipped",
        extraction_error:  `Unsupported mime type: ${ev.mime_type ?? "unknown"}`,
      })
      .eq("id", evidenceId);
    return json({ status: "skipped", reason: `mime ${ev.mime_type} not supported by Textract sync` });
  }

  // skip oversized files (sync API cap is 10 MB)
  if (typeof ev.file_size === "number" && ev.file_size > MAX_SYNC_SIZE_MB * 1024 * 1024) {
    await supabase.from("evidence")
      .update({
        extraction_status: "skipped",
        extraction_error:  `File exceeds ${MAX_SYNC_SIZE_MB} MB Textract sync limit`,
      })
      .eq("id", evidenceId);
    return json({ status: "skipped", reason: `file > ${MAX_SYNC_SIZE_MB} MB` });
  }

  // mark extracting so the UI can show a spinner
  await supabase.from("evidence")
    .update({ extraction_status: "extracting", extraction_error: null })
    .eq("id", evidenceId);

  const aws = new AwsClient({
    accessKeyId:     AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region:          AWS_REGION,
    service:         "textract",
  });

  try {
    const text = await detectDocumentText(aws, ev.s3_bucket, ev.s3_key);
    const entities = extractEntities(text);

    await supabase.from("evidence")
      .update({
        extraction_status:  "extracted",
        extracted_text:     text,
        extracted_entities: entities as unknown as Record<string, unknown>,
        extracted_at:       new Date().toISOString(),
        extraction_error:   null,
      })
      .eq("id", evidenceId);

    return json({
      status:       "extracted",
      text_length:  text.length,
      entities,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("evidence")
      .update({
        extraction_status: "failed",
        extraction_error:  msg.slice(0, 500),
      })
      .eq("id", evidenceId);
    return bad(`extraction failed: ${msg}`, 500);
  }
});
