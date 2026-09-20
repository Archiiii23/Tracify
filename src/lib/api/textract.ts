/**
 * Amazon Textract client — talks to the `textract-evidence` Supabase Edge
 * Function to enrich S3-backed evidence with extracted text + structured
 * entities. The function is idempotent so it's safe to retry.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ExtractedEntities {
  walletAddresses: string[];
  txHashes:        string[];
  amounts:         string[];
  dates:           string[];
}

export type TextractResult =
  | { status: "extracted"; text_length: number; entities: ExtractedEntities }
  | { status: "skipped";   reason: string };

export async function extractEvidence(evidenceId: string): Promise<TextractResult> {
  const { data, error } = await supabase.functions.invoke<TextractResult>(
    "textract-evidence",
    { body: { evidence_id: evidenceId } },
  );
  if (error) throw new Error(`Textract failed: ${error.message}`);
  if (!data)  throw new Error("Textract returned no data");
  return data;
}
