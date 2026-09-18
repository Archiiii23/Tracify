import { Schema, Types, model, type Document, type Model } from "mongoose";

export interface AuditLogDoc extends Document {
  _id: Types.ObjectId;
  actor?: Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, maxlength: 80 },
    resource: { type: String, required: true, maxlength: 80 },
    resourceId: { type: String, maxlength: 128 },
    requestId: { type: String, maxlength: 64 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

export const AuditLog: Model<AuditLogDoc> = model<AuditLogDoc>("AuditLog", auditLogSchema);
