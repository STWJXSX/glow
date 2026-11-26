import { Schema, model, Document } from 'mongoose';

/**
 * Product tiers (paid): premium (level 1).
 * booster = Discord boost (commands only, not stored as paid tier usually).
 * custom uses customTier (1 = premium).
 * Legacy basic | pro | ultimate | monthly | yearly | immortal are treated as premium at runtime.
 */
export type PremiumTier =
  | 'booster'
  | 'premium'
  | 'basic'
  | 'pro'
  | 'ultimate'
  | 'custom'
  | 'monthly'
  | 'yearly'
  | 'immortal';

/** @deprecated Use getPaidTierLevel from premiumPolicy */
export const TIER_HIERARCHY: Record<PremiumTier, number> = {
  booster: 0,
  premium: 1,
  basic: 1,
  pro: 1,
  ultimate: 1,
  custom: 0,
  monthly: 1,
  yearly: 1,
  immortal: 1,
};

export interface IGlowPremium extends Document {
  discordId: string;
  tier: PremiumTier;
  /** For custom plans: which tier level they have (1-3) */
  customTier: number | null;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  roleIds: string[];
  grantedBy: string | null;
  key: string | null;
  notes: string | null;
  warningSent: boolean;
  guildId: string | null;
}

const TIER_ENUM = [
  'booster', 'premium', 'basic', 'pro', 'ultimate', 'custom',
  'monthly', 'yearly', 'immortal',
] as const;

const glowPremiumSchema = new Schema<IGlowPremium>({
  discordId: { type: String, required: true, index: true },
  tier: {
    type: String,
    enum: TIER_ENUM,
    required: true,
  },
  customTier: { type: Number, default: null, min: 1, max: 3 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  roleIds: { type: [String], default: [] },
  grantedBy: { type: String, default: null },
  key: { type: String, default: null },
  notes: { type: String, default: null },
  warningSent: { type: Boolean, default: false },
  guildId: { type: String, default: null },
});

glowPremiumSchema.index({ discordId: 1, isActive: 1 });
glowPremiumSchema.index({ isActive: 1, expiresAt: 1 });

// ── Change notifications (lets premium.ts drop its short in-memory cache) ──
type PremiumChangeListener = (discordId?: string) => void;
const changeListeners: PremiumChangeListener[] = [];

/** Called with the affected discordId (or nothing when unknown → clear all). */
export function onGlowPremiumChange(listener: PremiumChangeListener): void {
  changeListeners.push(listener);
}

function notifyChange(discordId?: string): void {
  for (const listener of changeListeners) {
    try { listener(discordId); } catch { /* never break a write */ }
  }
}

glowPremiumSchema.post('save', (doc: IGlowPremium) => notifyChange(doc.discordId));
glowPremiumSchema.post('insertMany', () => notifyChange());
for (const op of ['deleteOne', 'deleteMany', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete'] as const) {
  glowPremiumSchema.post(op, function (this: any) {
    const id = this?.getFilter?.()?.discordId;
    notifyChange(typeof id === 'string' ? id : undefined);
  });
}
glowPremiumSchema.post('deleteOne', { document: true, query: false }, (doc: IGlowPremium) => notifyChange(doc.discordId));

export default model<IGlowPremium>('GlowPremium', glowPremiumSchema);
