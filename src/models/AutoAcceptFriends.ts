import { Schema, model, Document } from 'mongoose';

export interface IAccountAcceptFriends {
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  accountId: string;
}

export interface IAutoAcceptFriends extends Document {
  discordId: string;
  accounts: Map<string, IAccountAcceptFriends>;
  updatedAt: Date;
}

const autoAcceptFriendsSchema = new Schema<IAutoAcceptFriends>({
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

autoAcceptFriendsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoAcceptFriends>('AutoAcceptFriends', autoAcceptFriendsSchema);
