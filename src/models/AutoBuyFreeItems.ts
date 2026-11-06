import { Schema, model, Document } from 'mongoose';

export interface IAccountAutoBuy {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
}

export interface IAutoBuyFreeItems extends Document {
  discordId: string;
  accounts: Map<string, IAccountAutoBuy>;
  updatedAt: Date;
}

const autoBuyFreeItemsSchema = new Schema<IAutoBuyFreeItems>({
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

// Middleware para actualizar updatedAt
autoBuyFreeItemsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoBuyFreeItems>('AutoBuyFreeItems', autoBuyFreeItemsSchema);
