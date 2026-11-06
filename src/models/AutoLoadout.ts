import { Schema, model, Document } from 'mongoose';

export interface ILoadoutConfig {
  loadoutGUID: string;
  loadoutIndex: number;
  commanderTemplateId: string;
  commanderDisplayName: string;
  missionType: string;
}

export interface IAccountLoadout {
  isActive: boolean;
  accountId: string;
  loadouts: Map<string, ILoadoutConfig>;
  createdAt: Date;
  lastActivity: Date;
}

export interface IAutoLoadout extends Document {
  discordId: string;
  accounts: Map<string, IAccountLoadout>;
  updatedAt: Date;
}

const loadoutConfigSchema = {
  loadoutGUID: { type: String, required: true },
  loadoutIndex: { type: Number, required: true },
  commanderTemplateId: { type: String, required: true },
  commanderDisplayName: { type: String, default: '' },
  missionType: { type: String, required: true },
};

const autoLoadoutSchema = new Schema<IAutoLoadout>({
  discordId: { type: String, required: true, unique: true },
  accounts: {
    type: Map,
    of: {
      isActive: { type: Boolean, default: false },
      accountId: { type: String, required: true },
      loadouts: {
        type: Map,
        of: loadoutConfigSchema,
        default: new Map(),
      },
      createdAt: { type: Date, default: Date.now },
      lastActivity: { type: Date, default: Date.now },
    },
    default: new Map(),
  },
  updatedAt: { type: Date, default: Date.now },
});

autoLoadoutSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoLoadout>('AutoLoadout', autoLoadoutSchema);
