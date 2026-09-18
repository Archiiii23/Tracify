import bcrypt from "bcryptjs";
import { Schema, Types, model, type Document, type Model } from "mongoose";
import type { AppRole } from "../types/express";

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  email: string;
  name: string;
  /** Never selected by default — must be requested explicitly. */
  passwordHash: string;
  role: AppRole;
  organisation?: string;
  lastLoginAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  verifyPassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<UserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // `select: false` keeps the hash out of every accidental read/serialisation.
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["investigator", "admin"],
      default: "investigator",
      required: true,
    },
    organisation: { type: String, trim: true, maxlength: 160 },
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['passwordHash'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

userSchema.methods.verifyPassword = function verifyPassword(candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash as string);
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export const User: Model<UserDoc> = model<UserDoc>("User", userSchema);
