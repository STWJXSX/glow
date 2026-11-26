import { Schema, model, Document } from 'mongoose';

export interface IReminderItem {
  cosmeticId: string;
  cosmeticName: string; // stored so we can display it without API lookup
  cosmeticType: string;
  addedAt: Date;
}

export interface IAccountReminder {
  isActive: boolean;
  accountId: string;
  watchedItems: IReminderItem[];
  createdAt: Date;
  lastActivity: Date;
}

export interface IReminder extends Document {
  discordId: string;
  accounts: Map<string, IAccountReminder>;
  updatedAt: Date;
}

const reminderSchema = new Schema<IReminder>({
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
      watchedItems: {
        type: [
          {
            cosmeticId: { type: String, required: true },
            cosmeticName: { type: String, required: true },
            cosmeticType: { type: String, default: 'Item' },
            addedAt: { type: Date, default: Date.now },
          },
        ],
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

reminderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IReminder>('Reminder', reminderSchema);
