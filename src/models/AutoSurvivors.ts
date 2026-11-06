import { Schema, model, Document } from 'mongoose';

export interface ISurvivorSlot {
  itemId: string;
  templateId: string;
  squadId: string;
  slotIndex: number;
}

export interface ISurvivorPreset {
  name: string;
  workers: ISurvivorSlot[];
  savedAt: Date;
}

export interface IAccountSurvivors {
  isActive: boolean;
  accountId: string;
  presets: Map<string, ISurvivorPreset>;
  missionMappings: Map<string, string>;
  createdAt: Date;
  lastActivity: Date;
}

export interface IAutoSurvivors extends Document {
  discordId: string;
  accounts: Map<string, IAccountSurvivors>;
  updatedAt: Date;
}

const survivorSlotSchema = new Schema({
  itemId: { type: String, required: true },
  templateId: { type: String, required: true },
  squadId: { type: String, required: true },
  slotIndex: { type: Number, required: true },
}, { _id: false });

const survivorPresetSchema = new Schema({
  name: { type: String, required: true },
  workers: { type: [survivorSlotSchema], default: [] },
  savedAt: { type: Date, default: Date.now },
}, { _id: false });

const accountSurvivorsSchema = new Schema({
  isActive: { type: Boolean, default: false },
  accountId: { type: String, required: true },
  presets: {
    type: Map,
    of: survivorPresetSchema,
    default: new Map(),
  },
  missionMappings: {
    type: Map,
    of: String,
    default: new Map(),
  },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
}, { _id: false });

const autoSurvivorsSchema = new Schema<IAutoSurvivors>({
  discordId: { type: String, required: true, unique: true },
  accounts: {
    type: Map,
    of: accountSurvivorsSchema,
    default: new Map(),
  },
  updatedAt: { type: Date, default: Date.now },
});

autoSurvivorsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoSurvivors>('AutoSurvivors', autoSurvivorsSchema);
