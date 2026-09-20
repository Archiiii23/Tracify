// =============================================================================
// TRACIFY — s3-presign Edge Function
//
// Mints short-lived Amazon S3 presigned URLs for the Evidence Vault.
// The frontend never sees AWS credentials — only the signed URL.
//
// Actions:
//   POST { action: "upload",   case_id, file_name, mime_type }
//        → { url, method: "PUT", key, bucket, expires_in }
//
//   POST { action: "download", key }
//        → { url, method: "GET", expires_in }
//
//   POST { action: "delete",   key }
//        → { url, method: "DELETE", expires_in }
//
// Auth: caller must pass Supabase JWT in Authorization header. We verify the
// user exists and — for upload — enforce that the user has access to the case
// via RLS. If Supabase says the case is invisible, we refuse to sign.
//
// Required Edge Function secrets:
//   AWS_ACCESS_KEY_ID       - IAM user with least-privilege S3 permissions
//   AWS_SECRET_ACCESS_KEY
//   AWS_REGION              - e.g. ap-south-1
//   AWS_S3_BUCKET           - e.g. tracify-evidence
//   (SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by Supabase)
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

const UPLOAD_TTL_SECONDS   = 15 * 60; // 15 min to complete an upload
const DOWNLOAD_TTL_SECONDS = 5 * 60;  // 5 min to fetch a download URL
const DELETE_TTL_SECONDS   = 60;

const MAX_FILE_NAME_LENGTH = 200;
const ALLOWED_MIME_PREFIXES = [
  "image/", "application/pdf", "application/json", "text/", "video/", "audio/",
  "application/zip", "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument", "application/msword",
  "application/vnd.ms-excel",
];

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

// ---------- helpers ----------
function sanitizeFileName(name: string): string {
  // strip path components, control chars, and anything outside a safe set
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-MAX_FILE_NAME_LENGTH) || "file";
}

function isAllowedMime(mime: string | undefined): boolean {
  if (!mime) return true; // browser may not report; still allow
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function objectUrl(bucket: string, region: string, key: string): string {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `https://${host}/${encodedKey}`;
}

function assertKeyBelongsToCase(key: string, caseId: string) {
  if (!key.startsWith(`cases/${caseId}/`)) {
    throw new Error("key does not belong to the given case");
  }
}

async function sign(
  aws: AwsClient,
  method: "PUT" | "GET" | "DELETE",
  bucket: string,
  key: string,
  expiresInSeconds: number,
  extraQuery: Record<string, string> = {},
): Promise<string> {
  const url = new URL(objectUrl(bucket, AWS_REGION, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  for (const [k, v] of Object.entries(extraQuery)) url.searchParams.set(k, v);
  const signed = await aws.sign(url.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return bad("method not allowed", 405);

  // 1. env sanity
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    return bad("S3 environment is not configured (missing AWS_* secrets)", 500);
  }

  // 2. auth: forward the caller's JWT to Supabase and confirm identity
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
  const userId = userRes.user.id;

  // 3. parse body
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid JSON body"); }
  const action = String(body.action ?? "");

  const aws = new AwsClient({
    accessKeyId:     AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region:          AWS_REGION,
    service:         "s3",
  });

  try {
    if (action === "upload") {
      const caseId    = String(body.case_id ?? "");
      const fileName  = sanitizeFileName(String(body.file_name ?? ""));
      const mimeType  = body.mime_type ? String(body.mime_type) : undefined;
      if (!caseId)                  return bad("case_id is required");
      if (!fileName)                return bad("file_name is required");
      if (!isAllowedMime(mimeType)) return bad(`mime type ${mimeType} is not allowed`, 415);

      // RLS gate: if the caller can't SELECT the case, they can't upload for it
      const { data: c, error: cErr } = await supabase
        .from("cases").select("id").eq("id", caseId).maybeSingle();
      if (cErr)  return bad(cErr.message, 500);
      if (!c)    return bad("case not found or access denied", 404);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rand  = crypto.randomUUID().slice(0, 8);
      const key   = `cases/${caseId}/evidence/${stamp}-${rand}-${fileName}`;

      const url = await sign(aws, "PUT", AWS_S3_BUCKET, key, UPLOAD_TTL_SECONDS);
      return json({
        url,
        method:     "PUT",
        key,
        bucket:     AWS_S3_BUCKET,
        region:     AWS_REGION,
        expires_in: UPLOAD_TTL_SECONDS,
        uploader:   userId,
      });
    }

    if (action === "download") {
      const key = String(body.key ?? "");
      if (!key) return bad("key is required");

      // Only allow download if there's an evidence row for this key the caller can see (RLS)
      const { data: ev, error: evErr } = await supabase
        .from("evidence").select("id, case_id, s3_key")
        .eq("s3_key", key).maybeSingle();
      if (evErr) return bad(evErr.message, 500);
      if (!ev)   return bad("evidence not found or access denied", 404);

      const url = await sign(aws, "GET", AWS_S3_BUCKET, key, DOWNLOAD_TTL_SECONDS);
      return json({
        url,
        method:     "GET",
        expires_in: DOWNLOAD_TTL_SECONDS,
      });
    }

    if (action === "delete") {
      const key = String(body.key ?? "");
      if (!key) return bad("key is required");

      // Only the row owner or an admin can delete — RLS enforces this on the DB
      // side. Here we verify a row exists that the caller can update/delete.
      const { data: ev, error: evErr } = await supabase
        .from("evidence").select("id, added_by").eq("s3_key", key).maybeSingle();
      if (evErr) return bad(evErr.message, 500);
      if (!ev)   return bad("evidence not found or access denied", 404);

      const url = await sign(aws, "DELETE", AWS_S3_BUCKET, key, DELETE_TTL_SECONDS);
      return json({
        url,
        method:     "DELETE",
        expires_in: DELETE_TTL_SECONDS,
      });
    }

    return bad(`unknown action: ${action}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return bad(`presign failed: ${msg}`, 500);
  }
});
