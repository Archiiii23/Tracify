-- =============================================================================
-- TRACIFY — Evidence Vault: Amazon Textract enrichment columns
--
-- After an evidence file is uploaded to S3, the `textract-evidence` Edge
-- Function extracts plain text + structured entities (wallet addresses,
-- transaction hashes, amounts) and writes them here. That gives investigators
-- searchable, structured content out of every PDF / screenshot instead of
-- opaque binaries.
-- =============================================================================

ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS extraction_status   TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','skipped','extracting','extracted','failed')),
  ADD COLUMN IF NOT EXISTS extracted_text      TEXT,
  ADD COLUMN IF NOT EXISTS extracted_entities  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_error    TEXT;

-- GIN index for full-text search over extracted content
CREATE INDEX IF NOT EXISTS evidence_extracted_text_gin
  ON public.evidence
  USING GIN (to_tsvector('simple', COALESCE(extracted_text, '')));

-- Filter index for the extraction queue
CREATE INDEX IF NOT EXISTS evidence_extraction_status_idx
  ON public.evidence(extraction_status)
  WHERE extraction_status IN ('pending', 'extracting', 'failed');

COMMENT ON COLUMN public.evidence.extraction_status  IS 'pending → extracting → extracted / failed / skipped (non-extractable file type)';
COMMENT ON COLUMN public.evidence.extracted_text     IS 'Plain text pulled by Amazon Textract DetectDocumentText';
COMMENT ON COLUMN public.evidence.extracted_entities IS 'Structured entities: { walletAddresses[], txHashes[], amounts[], dates[] }';
