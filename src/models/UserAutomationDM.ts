import { Schema, model, Document } from 'mongoose';

export interface IUserAutomationDM extends Document {
  discordId: string;
  /** Autoconfig panel keys whose automation DMs are disabled for this user. */
  disabledSystems: string[];
  updatedAt: Date;
}

const userAutomationDMSchema = new Schema<IUserAutomationDM>({
  discordId: { type: String, required: true, unique: true },
  disabledSystems: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

userAutomationDMSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IUserAutomationDM>('UserAutomationDM', userAutomationDMSchema);
