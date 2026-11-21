import { Schema, model, Document } from 'mongoose';

export interface IAccountSAC {
  isActive: boolean;
  sacToSet: string;
  accountId: string;
}

export interface IAutoSAC extends Document {
  discordId: string;
  accounts: Map<string, IAccountSAC>;
  updatedAt: Date;
}

const autoSACSchema = new Schema<IAutoSAC>({
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
      sacToSet: {
        type: String,
        required: true,
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

// Middleware para actualizar updatedAt
autoSACSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoSAC>('AutoSAC', autoSACSchema);
