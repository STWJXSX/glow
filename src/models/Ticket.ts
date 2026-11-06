import { Schema, model, Document } from 'mongoose';

export interface ITicketMessage {
  authorId: string;
  authorTag: string;
  authorAvatar: string;
  content: string;
  timestamp: Date;
  attachments: string[];
}

export interface ITicket extends Document {
  channelId: string;
  guildId: string;
  userId: string;
  userTag: string;
  topic: 'premium' | 'bot_support' | 'server_issues' | 'other';
  premiumPlan: string | null;
  premiumTier: 'basic' | 'pro' | 'ultimate' | null;
  language: string;
  status: 'open' | 'closed';
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
  premiumGranted: boolean;
  messages: ITicketMessage[];
}

const ticketMessageSchema = new Schema<ITicketMessage>({
  authorId: { type: String, required: true },
  authorTag: { type: String, required: true },
  authorAvatar: { type: String, default: '' },
  content: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  attachments: { type: [String], default: [] },
}, { _id: false });

const ticketSchema = new Schema<ITicket>({
  channelId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  userTag: { type: String, required: true },
  topic: { type: String, enum: ['premium', 'bot_support', 'server_issues', 'other'], required: true },
  premiumPlan: { type: String, default: null },
  premiumTier: { type: String, enum: ['basic', 'pro', 'ultimate', null], default: null },
  language: { type: String, default: 'en' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  closedBy: { type: String, default: null },
  closedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  premiumGranted: { type: Boolean, default: false },
  messages: { type: [ticketMessageSchema], default: [] },
});

ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ guildId: 1, status: 1 });

export default model<ITicket>('Ticket', ticketSchema);
