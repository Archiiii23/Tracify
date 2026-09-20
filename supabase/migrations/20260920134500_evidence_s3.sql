-- =============================================================================
-- TRACIFY — Evidence Vault: Amazon S3 columns
-- Adds S3 object metadata to public.evidence so real files can live in S3
-- while Postgres continues to store the case-linked metadata + chain-of-custody
-- checksum. attachment_url is retained for backward compatibility.
-- =============================================================================

ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS s3_bucket    TEXT,
  ADD COLUMN IF NOT EXISTS s3_key       TEXT,
  ADD COLUMN IF NOT EXISTS original_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type    TEXT,
  ADD COLUMN IF NOT EXISTS file_size    BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;

-- Uniqueness: no two evidence rows should ever claim the same S3 object
CREATE UNIQUE INDEX IF NOT EXISTS evidence_s3_key_unique
  ON public.evidence(s3_bucket, s3_key)
  WHERE s3_key IS NOT NULL;

-- Fast lookup by case for the evidence page
CREATE INDEX IF NOT EXISTS evidence_case_idx
  ON public.evidence(case_id);

COMMENT ON COLUMN public.evidence.s3_bucket       IS 'Amazon S3 bucket name (e.g. tracify-evidence)';
COMMENT ON COLUMN public.evidence.s3_key          IS 'Full S3 object key: cases/{caseId}/evidence/{uniqueFileName}';
COMMENT ON COLUMN public.evidence.original_name   IS 'The uploader-provided filename, preserved for display';
COMMENT ON COLUMN public.evidence.mime_type       IS 'MIME type reported at upload time';
COMMENT ON COLUMN public.evidence.file_size       IS 'Object size in bytes at upload time';
COMMENT ON COLUMN public.evidence.checksum_sha256 IS 'Client-computed SHA-256 for chain-of-custody sealing';
