import { Schema, model, Document } from 'mongoose';

export interface IGiveawayParticipant {
  entries: number;
  joinedAt: Date;
}

export interface IGiveaway extends Document {
  guildId: string;
  channelId: string;
  messageId: string;
  prize: string;
  description: string | null;
  imageUrl: string | null;
  hostId: string;
  endsAt: Date;
  ended: boolean;
  winnerId: string | null;
  participants: Map<string, IGiveawayParticipant>;
  createdAt: Date;
  embedColor: number | null;
  buttonStyle: number | null;
  buttonLabel: string | null;
  buttonEmoji: string | null;
}

const giveawaySchema = new Schema<IGiveaway>({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  prize: { type: String, required: true },
  description: { type: String, default: null },
  imageUrl: { type: String, default: null },
  hostId: { type: String, required: true },
  endsAt: { type: Date, required: true },
  ended: { type: Boolean, default: false },
  winnerId: { type: String, default: null },
  participants: {
    type: Map,
    of: {
      entries: { type: Number, default: 1 },
      joinedAt: { type: Date, default: Date.now },
    },
    default: new Map(),
  },
  createdAt: { type: Date, default: Date.now },
  embedColor: { type: Number, default: null },
  buttonStyle: { type: Number, default: null },
  buttonLabel: { type: String, default: null },
  buttonEmoji: { type: String, default: null },
});

giveawaySchema.index({ ended: 1, endsAt: 1 });

export default model<IGiveaway>('Giveaway', giveawaySchema);
