import { Schema, model, Document } from 'mongoose';

/** Singleton document — global premium requirement toggle. */
export interface IGlowPremiumCheckState extends Document {
  key: 'global';
  /** false = premium checks bypassed (free for everyone). */
  checksEnabled: boolean;
  bypassUntil: Date | null;
  durationLabel: string | null;
  graceScanPending: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}

const glowPremiumCheckStateSchema = new Schema<IGlowPremiumCheckState>({
  key: { type: String, required: true, unique: true, default: 'global', enum: ['global'] },
  checksEnabled: { type: Boolean, default: true },
  bypassUntil: { type: Date, default: null },
  durationLabel: { type: String, default: null },
  graceScanPending: { type: Boolean, default: false },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default model<IGlowPremiumCheckState>('GlowPremiumCheckState', glowPremiumCheckStateSchema);
