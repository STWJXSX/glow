import { Schema, model, Document } from 'mongoose';

export interface IWhitelistEntry {
  accountId: string;
  displayName: string;
}

export interface IAccountPurgeFriends {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
  whitelist: IWhitelistEntry[];
}

export interface IAutoPurgeFriends extends Document {
  discordId: string;
  accounts: Map<string, IAccountPurgeFriends>;
  updatedAt: Date;
}

const autoPurgeFriendsSchema = new Schema<IAutoPurgeFriends>({
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

autoPurgeFriendsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoPurgeFriends>('AutoPurgeFriends', autoPurgeFriendsSchema);
