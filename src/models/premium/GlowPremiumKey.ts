import { Schema, model, Document } from 'mongoose';
import type { PremiumTier } from './GlowPremium.ts';

const TIER_ENUM = [
  'booster', 'basic', 'pro', 'ultimate', 'custom',
  'monthly', 'yearly', 'immortal',
] as const;

export interface IGlowPremiumKey extends Document {
  key: string;
  tier: PremiumTier;
  /** For custom plans: which tier level (1-3) */
  customTier: number | null;
  /** Days until expiration (null = permanent/immortal) */
  days: number | null;
  /** Discord role IDs to grant */
  roleIds: string[];
  /** Guild where roles should be applied */
  guildId: string | null;
  uses: number;
  maxUses: number;
  createdBy: string;
  createdAt: Date;
  redeemedBy: string | null;
  redeemedAt: Date | null;
  notes: string | null;
}

const glowPremiumKeySchema = new Schema<IGlowPremiumKey>({
  key: { type: String, required: true, unique: true, index: true },
  tier: {
    type: String,
    enum: TIER_ENUM,
    required: true,
  },
  customTier: { type: Number, default: null, min: 1, max: 3 },
  days: { type: Number, default: null },
  roleIds: { type: [String], default: [] },
  guildId: { type: String, default: null },
  uses: { type: Number, default: 0 },
  maxUses: { type: Number, default: 1 },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  redeemedBy: { type: String, default: null },
  redeemedAt: { type: Date, default: null },
  notes: { type: String, default: null },
});

export default model<IGlowPremiumKey>('GlowPremiumKey', glowPremiumKeySchema);
