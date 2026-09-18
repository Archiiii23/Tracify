import { Schema, model, type Model } from "mongoose";
import { formatSequentialId } from "../utils/generateId";

/**
 * Atomic per-prefix, per-year sequence source. `findOneAndUpdate` with `$inc`
 * is a single atomic operation, so two concurrent case creations can never
 * receive the same human-readable id.
 */
export interface CounterDoc {
  key: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const Counter: Model<CounterDoc> = model<CounterDoc>("Counter", counterSchema);

/** Reserve the next id for a prefix, e.g. `nextSequentialId("CASE")`. */
export async function nextSequentialId(prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `${prefix.toUpperCase()}-${year}`;
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return formatSequentialId(prefix, doc?.seq ?? 1, { year });
}
