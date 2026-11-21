import { Schema, model, Document } from 'mongoose';

export interface IWatchedFriend {
  accountId: string;
  displayName: string;
  /** DM when this friend comes online. */
  notifyOnline: boolean;
  /** DM when this friend goes offline. */
  notifyOffline: boolean;
}

export interface IAccountAutoFriendAlerts {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
  /** Friends to track. Empty by default — no XMPP connection is opened until one is added. */
  friends: IWatchedFriend[];
}

export interface IAutoFriendAlerts extends Document {
  discordId: string;
  accounts: Map<string, IAccountAutoFriendAlerts>;
  updatedAt: Date;
}

const autoFriendAlertsSchema = new Schema<IAutoFriendAlerts>({
  discordId: {
    type: String,
    required: true,
    unique: true,
  },
  accounts: {
    type: Map,
    of: {
      isActive: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      lastActivity: { type: Date, default: Date.now },
      accountId: { type: String, required: true },
      friends: {
        type: [
          {
            _id: false,
            accountId: { type: String, required: true },
            displayName: { type: String, required: true },
            notifyOnline: { type: Boolean, default: true },
            notifyOffline: { type: Boolean, default: true },
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

autoFriendAlertsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoFriendAlerts>('AutoFriendAlerts', autoFriendAlertsSchema);
