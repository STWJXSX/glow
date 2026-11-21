import { Schema, model, Document } from 'mongoose';

interface IAccountExpedition {
  isActive: boolean;
  rewardTypes: string[];
  createdAt: Date;
  lastActivity: Date;
  displayName: string;
}

export interface IAutoExpediciones extends Document {
  discordId: string;
  accounts: Map<string, IAccountExpedition>;
  updatedAt: Date;
}

const autoExpedicionesSchema = new Schema<IAutoExpediciones>({
  discordId: {
    type: String,
    required: true,
    unique: true,
  },
  accounts: {
    type: Map,
    of: {
      isActive: {
        type: Boolean,
        default: false,
      },
      rewardTypes: {
        type: [String],
        default: [],
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      lastActivity: {
        type: Date,
        default: Date.now,
      },
      displayName: {
        type: String,
        default: '',
      },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware para actualizar updatedAt
autoExpedicionesSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoExpediciones>('AutoExpediciones', autoExpedicionesSchema, 'autoexpediciones');
