import { Schema, model, Document } from 'mongoose';

export interface IWhitelistEntry {
  accountId: string;
  displayName: string;
}

export interface IAccountAcceptInvites {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
  useWhitelist: boolean;
  whitelist: IWhitelistEntry[];
}

export interface IAutoAcceptInvites extends Document {
  discordId: string;
  accounts: Map<string, IAccountAcceptInvites>;
  updatedAt: Date;
}

const autoAcceptInvitesSchema = new Schema<IAutoAcceptInvites>({
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
      useWhitelist: {
        type: Boolean,
        default: false,
      },
      whitelist: {
        type: [
          {
            accountId: { type: String, required: true },
            displayName: { type: String, required: true },
          },
        ],
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

autoAcceptInvitesSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoAcceptInvites>('AutoAcceptInvites', autoAcceptInvitesSchema);
