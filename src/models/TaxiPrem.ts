import { Schema, model, Document } from 'mongoose';

export interface ICosmetics {
  skinId: string;
  emoteId: string;
  bannerId: string;
}

export interface IPresences {
  available: string;
  busy: string;
}

export interface IMessages {
  joinMessage: string;
  leaveMessage: string;
}

export interface ITaxiPrem extends Document {
  discordId: string;
  accountId: string;
  acceptedTOS: boolean;
  isEnabled: boolean;
  autoAcceptFriends: boolean;
  cosmetics: ICosmetics;
  powerLevel: number;
  displayLevel: number;
  isPublic: boolean;
  whitelist: string[];
  presences: IPresences;
  messages: IMessages;
  sessionTimeout: number;
  lastInviteAt: Date | null;
  createdAt: Date;
  lastActivity: Date;
}

const cosmeticsSchema = new Schema({
  skinId: { type: String, default: 'CID_A_046_Athena_Commando_F_AssembleR' },
  emoteId: { type: String, default: 'EID_Floss' },
  bannerId: { type: String, default: 'EnduranceWave30Theater01' },
}, { _id: false });

const presencesSchema = new Schema({
  available: { type: String, default: '💚 | discord.gg/KUwvtWrS8W' },
  busy: { type: String, default: '❤️ | discord.gg/KUwvtWrS8W' },
}, { _id: false });

const messagesSchema = new Schema({
  joinMessage: { type: String, default: '👋 Hola!' },
  leaveMessage: { type: String, default: 'Adios!' },
}, { _id: false });

const taxiPremSchema = new Schema<ITaxiPrem>({
  discordId: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  acceptedTOS: { type: Boolean, default: false },
  isEnabled: { type: Boolean, default: false },
  autoAcceptFriends: { type: Boolean, default: false },
  cosmetics: { type: cosmeticsSchema, default: () => ({}) },
  powerLevel: { type: Number, default: 288 },
  displayLevel: { type: Number, default: 999 },
  isPublic: { type: Boolean, default: true },
  whitelist: { type: [String], default: [] },
  presences: { type: presencesSchema, default: () => ({}) },
  messages: { type: messagesSchema, default: () => ({}) },
  sessionTimeout: { type: Number, default: 2 },
  lastInviteAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
});

taxiPremSchema.pre('save', function (next) {
  this.lastActivity = new Date();
  next();
});

export default model<ITaxiPrem>('TaxiPrem', taxiPremSchema);
