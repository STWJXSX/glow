import { Schema, model, Document } from 'mongoose';

export interface IAccountDaily {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: Date | null;
}

export interface IAutoDaily extends Document {
  discordId: string;
  accounts: Map<string, IAccountDaily>;
  updatedAt: Date;
}

const autoDailySchema = new Schema<IAutoDaily>({
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
      suspended: { type: Boolean, default: false },
      suspendedReason: { type: String, default: '' },
      suspendedAt: { type: Date, default: null },
    },
    default: new Map(),
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware para actualizar updatedAt
autoDailySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoDaily>('AutoDaily', autoDailySchema);
