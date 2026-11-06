import { Schema, model, Document } from 'mongoose';

/** Same collections as Mercadona's giftbots (apps/bots/mercadona/lib/giftbots/models.js). */
export interface IGiftBotAccount extends Document {
  label: string;
  displayName: string;
  deviceAuth: { accountId: string; deviceId: string; secret: string };
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date | null;
  available: number;
  poolAvailable: boolean;
  enabled: boolean;
}

export interface IGiftWallet extends Document {
  discordId: string;
  available: number;
}

const giftBotAccountSchema = new Schema<IGiftBotAccount>(
  {
    label: { type: String, default: '' },
    displayName: { type: String, default: '' },
    deviceAuth: {
      accountId: { type: String, required: true },
      deviceId: { type: String, required: true },
      secret: { type: String, required: true },
    },
    accessToken: { type: String, default: '' },
    refreshToken: { type: String, default: '' },
    tokenExpiresAt: { type: Date, default: null },
    available: { type: Number, default: 0 },
    poolAvailable: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
  },
  { collection: 'mercadona_gift_bot_accounts', strict: false },
);

const giftWalletSchema = new Schema<IGiftWallet>(
  {
    discordId: { type: String, required: true, unique: true },
    available: { type: Number, default: 0, min: 0 },
  },
  { collection: 'mercadona_gift_wallets', strict: false },
);

/** Message ids of the panels posted by Glow. Same collection as Mercadona's; Glow's keys are prefixed `glow_` so they never collide. */
export interface IGiftMeta extends Document {
  key: string;
  channelId: string;
  messageId: string;
}

const giftMetaSchema = new Schema<IGiftMeta>(
  {
    key: { type: String, required: true },
    channelId: { type: String, default: '' },
    messageId: { type: String, default: '' },
  },
  { timestamps: true, collection: 'mercadona_gift_meta', strict: false, autoIndex: false },
);

export const GiftMeta = model<IGiftMeta>('GlowGiftMeta', giftMetaSchema);

export const GiftBotAccount = model<IGiftBotAccount>('GlowGiftBotAccount', giftBotAccountSchema);
export const GiftWallet = model<IGiftWallet>('GlowGiftWallet', giftWalletSchema);
