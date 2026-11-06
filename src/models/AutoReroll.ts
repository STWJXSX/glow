import { Schema, model, Document } from 'mongoose';

export interface IAccountReroll {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
  /** Quest keys the user wants to auto-reroll (e.g. "daily_destroybears") */
  unwantedQuests: string[];
}

export interface IAutoReroll extends Document {
  discordId: string;
  accounts: Map<string, IAccountReroll>;
  updatedAt: Date;
}

const autoRerollSchema = new Schema<IAutoReroll>({
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
      unwantedQuests: {
        type: [String],
        default: [],
      },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

autoRerollSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoReroll>('AutoReroll', autoRerollSchema);
