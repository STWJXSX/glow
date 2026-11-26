import { Schema, model, Document } from 'mongoose';

export interface IAccountBuySelected {
  isActive: boolean;
  accountId: string;
  watchedCosmeticIds: string[]; // list of cosmetic IDs (e.g. CID_A_059_...) to watch and auto-buy
  createdAt: Date;
  lastActivity: Date;
}

export interface IAutoBuySelectedItems extends Document {
  discordId: string;
  accounts: Map<string, IAccountBuySelected>;
  updatedAt: Date;
}

const autoBuySelectedItemsSchema = new Schema<IAutoBuySelectedItems>({
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
      accountId: {
        type: String,
        required: true,
      },
      watchedCosmeticIds: {
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
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

autoBuySelectedItemsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoBuySelectedItems>('AutoBuySelectedItems', autoBuySelectedItemsSchema);
