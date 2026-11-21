import { Schema, model, Document } from 'mongoose';

/** Singleton — AI memory + in-AI Epic systems premium bypass. */
export interface IGlowAiPremiumCheckState extends Document {
  key: 'global';
  /** false = AI premium gates bypassed (free memory + in-AI systems). */
  checksEnabled: boolean;
  bypassUntil: Date | null;
  durationLabel: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

const glowAiPremiumCheckStateSchema = new Schema<IGlowAiPremiumCheckState>({
  key: { type: String, required: true, unique: true, default: 'global', enum: ['global'] },
  checksEnabled: { type: Boolean, default: true },
  bypassUntil: { type: Date, default: null },
  durationLabel: { type: String, default: null },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default model<IGlowAiPremiumCheckState>('GlowAiPremiumCheckState', glowAiPremiumCheckStateSchema);
