/**
 * Amazon S3 evidence upload/download client.
 *
 * Talks to the `s3-presign` Supabase Edge Function to mint short-lived
 * presigned URLs, then PUT/GETs the file directly to Amazon S3 from the
 * browser. AWS credentials never touch this code.
 */

import { supabase } from "@/integrations/supabase/client";

export interface PresignedUpload {
  url: string;
  method: "PUT";
  key: string;
  bucket: string;
  region: string;
  expires_in: number;
  uploader: string;
}

export interface PresignedDownload {
  url: string;
  method: "GET";
  expires_in: number;
}

export interface UploadedEvidenceMeta {
  s3_key: string;
  s3_bucket: string;
  file_size: number;
  mime_type: string;
  original_name: string;
  checksum_sha256: string;
}

/** Ask the Edge Function for a presigned PUT URL for this file. */
export async function getPresignedUploadUrl(params: {
  case_id: string;
  file_name: string;
  mime_type?: string;
}): Promise<PresignedUpload> {
  const { data, error } = await supabase.functions.invoke<PresignedUpload>(
    "s3-presign",
    { body: { action: "upload", ...params } },
  );
  if (error) throw new Error(`presign upload failed: ${error.message}`);
  if (!data)  throw new Error("presign upload returned no data");
  return data;
}

/** Ask for a presigned GET URL (used to open/download a stored object). */
export async function getPresignedDownloadUrl(key: string): Promise<PresignedDownload> {
  const { data, error } = await supabase.functions.invoke<PresignedDownload>(
    "s3-presign",
    { body: { action: "download", key } },
  );
  if (error) throw new Error(`presign download failed: ${error.message}`);
  if (!data)  throw new Error("presign download returned no data");
  return data;
}

/** Compute SHA-256 of a Blob using the browser's SubtleCrypto. Returns hex. */
export async function sha256Hex(file: Blob): Promise<string> {
  const buf  = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Full upload flow: get a presigned URL, PUT the file directly to S3,
 * seal a SHA-256 checksum, and return the metadata ready for insertion
 * into public.evidence.
 */
export async function uploadEvidenceToS3(params: {
  case_id: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): Promise<UploadedEvidenceMeta> {
  const { case_id, file, onProgress } = params;

  onProgress?.(0.05);
  const presigned = await getPresignedUploadUrl({
    case_id,
    file_name: file.name,
    mime_type: file.type || undefined,
  });

  onProgress?.(0.15);
  const checksum = await sha256Hex(file);

  onProgress?.(0.25);
  // Use XHR for real upload progress (fetch has no upload progress event).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(presigned.method, presigned.url, true);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const frac = 0.25 + 0.7 * (e.loaded / e.total);
      onProgress?.(Math.min(frac, 0.95));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("S3 upload network error"));
    xhr.send(file);
  });

  onProgress?.(1);

  return {
    s3_key:          presigned.key,
    s3_bucket:       presigned.bucket,
    file_size:       file.size,
    mime_type:       file.type || "application/octet-stream",
    original_name:   file.name,
    checksum_sha256: checksum,
  };
}

/** Human-friendly byte size formatter for UI. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
