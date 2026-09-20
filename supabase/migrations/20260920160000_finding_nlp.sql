-- =============================================================================
-- TRACIFY — Findings: Amazon Comprehend NLP enrichment
--
-- The `comprehend-analyze` Edge Function calls three Comprehend APIs on each
-- finding's description text and writes structured results back here:
--   • DetectPiiEntities  → surfaces PII that shouldn't leave the tool
--   • DetectEntities     → auto-tags mentioned people / orgs / locations
--   • DetectSentiment    → prioritises distressed / high-emotion complaints
--
-- Applies to findings first (existing seed data + UI). Extensible to
-- complaints and evidence later by re-using the same function with a
-- target_table parameter.
-- =============================================================================

ALTER TABLE public.findings
  ADD COLUMN IF NOT EXISTS nlp_status           TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (nlp_status IN ('pending','analysing','analysed','failed')),
  ADD COLUMN IF NOT EXISTS nlp_entities         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nlp_pii              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nlp_sentiment        TEXT
    CHECK (nlp_sentiment IS NULL OR nlp_sentiment IN ('POSITIVE','NEGATIVE','NEUTRAL','MIXED')),
  ADD COLUMN IF NOT EXISTS nlp_sentiment_scores JSONB,
  ADD COLUMN IF NOT EXISTS nlp_language         TEXT,
  ADD COLUMN IF NOT EXISTS nlp_analysed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nlp_error            TEXT;

CREATE INDEX IF NOT EXISTS findings_nlp_status_idx
  ON public.findings(nlp_status)
  WHERE nlp_status IN ('pending','analysing','failed');

-- PII flag: quickly filter findings that need redaction attention
CREATE INDEX IF NOT EXISTS findings_pii_flag_idx
  ON public.findings((jsonb_array_length(nlp_pii) > 0))
  WHERE jsonb_array_length(nlp_pii) > 0;

COMMENT ON COLUMN public.findings.nlp_status           IS 'pending → analysing → analysed / failed';
COMMENT ON COLUMN public.findings.nlp_entities         IS '[{Type, Text, Score, BeginOffset, EndOffset}] from Comprehend DetectEntities';
COMMENT ON COLUMN public.findings.nlp_pii              IS '[{Type, Score, BeginOffset, EndOffset}] from Comprehend DetectPiiEntities';
COMMENT ON COLUMN public.findings.nlp_sentiment        IS 'Dominant sentiment: POSITIVE / NEGATIVE / NEUTRAL / MIXED';
COMMENT ON COLUMN public.findings.nlp_sentiment_scores IS 'Per-sentiment confidence: {Positive, Negative, Neutral, Mixed}';
COMMENT ON COLUMN public.findings.nlp_language         IS 'Dominant language code (e.g. en, hi, ta)';
