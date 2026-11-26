import { Schema, model, Document } from 'mongoose';

/**
 * Server boosts per user in the support guild (BOOST_GUILD_ID).
 *
 * Discord's bot API only says *whether* a member boosts (premiumSince), not how many boosts.
 * The boost sync job (core: monetization/jobs/boostSync.ts, every 3h) attributes boosts from
 * the guild's "X boosted the server" system messages and reconciles with the guild total.
 * `manualCount` (admin override) wins over the computed `boostCount` when set.
 */
export interface IGlowBoost extends Document {
  discordId: string;
  guildId: string;
  /** Computed by the sync: 0 = not boosting. */
  boostCount: number;
  /** Admin override (null = use boostCount). Ignored while the member is not boosting. */
  manualCount: number | null;
  premiumSince: Date | null;
  /** true when the guild total matched the attributed boosts on the last sync. */
  verified: boolean;
  lastSyncedAt: Date;
}

const glowBoostSchema = new Schema<IGlowBoost>({
  discordId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  boostCount: { type: Number, default: 0, min: 0 },
  manualCount: { type: Number, default: null, min: 0 },
  premiumSince: { type: Date, default: null },
  verified: { type: Boolean, default: false },
  lastSyncedAt: { type: Date, default: Date.now },
});

glowBoostSchema.index({ boostCount: 1 });

/** One row per boost system message (type GuildBoost / GuildBoostTier1-3). */
export interface IGlowBoostEvent extends Document {
  messageId: string;
  guildId: string;
  discordId: string;
  /** Boosts announced by the message (content holds the number when > 1). */
  count: number;
  at: Date;
}

const glowBoostEventSchema = new Schema<IGlowBoostEvent>({
  messageId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  discordId: { type: String, required: true, index: true },
  count: { type: Number, default: 1, min: 1 },
  at: { type: Date, required: true },
});

/** Sync cursor + last reconciliation summary (one doc per guild). */
export interface IGlowBoostSyncState extends Document {
  guildId: string;
  channelId: string | null;
  /** Newest system-channel message already scanned (snowflake). */
  lastMessageId: string | null;
  guildTotal: number;
  attributedTotal: number;
  boosters: number;
  lastSyncedAt: Date | null;
}

const glowBoostSyncStateSchema = new Schema<IGlowBoostSyncState>({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, default: null },
  lastMessageId: { type: String, default: null },
  guildTotal: { type: Number, default: 0 },
  attributedTotal: { type: Number, default: 0 },
  boosters: { type: Number, default: 0 },
  lastSyncedAt: { type: Date, default: null },
});

export const GlowBoostEvent = model<IGlowBoostEvent>('GlowBoostEvent', glowBoostEventSchema);
export const GlowBoostSyncState = model<IGlowBoostSyncState>('GlowBoostSyncState', glowBoostSyncStateSchema);
export default model<IGlowBoost>('GlowBoost', glowBoostSchema);
