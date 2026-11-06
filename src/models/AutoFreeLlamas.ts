import { Schema, model, Document } from 'mongoose';

export interface IAccountAutoFreeLlamas {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
}

export interface IAutoFreeLlamas extends Document {
  discordId: string;
  accounts: Map<string, IAccountAutoFreeLlamas>;
  updatedAt: Date;
}

const autoFreeLlamasSchema = new Schema<IAutoFreeLlamas>({
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
      createdAt: {
        type: Date,
        default: Date.now,
      },
      lastActivity: {
        type: Date,
        default: Date.now,
      },
      accountId: {
        type: String,
        required: true,
      },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

autoFreeLlamasSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoFreeLlamas>('AutoFreeLlamas', autoFreeLlamasSchema);
