/**
 * Amazon Comprehend client — talks to the `comprehend-analyze` Supabase Edge
 * Function to run NLP over a finding's text.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ComprehendEntity {
  type: string;   // PERSON | LOCATION | ORGANIZATION | DATE | QUANTITY | ...
  text: string;
  score: number;
  begin: number;
  end: number;
}

export interface ComprehendPii {
  type: string;   // NAME | PHONE | EMAIL | ADDRESS | SSN | IN_AADHAAR | ...
  score: number;
  begin: number;
  end: number;
}

export interface ComprehendSentimentScores {
  Positive: number;
  Negative: number;
  Neutral:  number;
  Mixed:    number;
}

export interface ComprehendResult {
  status: "analysed";
  language: string;
  entities: ComprehendEntity[];
  pii: ComprehendPii[];
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";
  sentimentScores: ComprehendSentimentScores;
}

export async function analyseFinding(findingId: string): Promise<ComprehendResult> {
  const { data, error } = await supabase.functions.invoke<ComprehendResult>(
    "comprehend-analyze",
    { body: { finding_id: findingId } },
  );
  if (error) throw new Error(`Comprehend failed: ${error.message}`);
  if (!data)  throw new Error("Comprehend returned no data");
  return data;
}
