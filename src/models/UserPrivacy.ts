import { Schema, model, Document } from 'mongoose';

export interface IUserPrivacy extends Document {
  discordId: string;
  maskName: boolean;
  updatedAt: Date;
}

const userPrivacySchema = new Schema<IUserPrivacy>({
  discordId: { type: String, required: true, unique: true },
  maskName: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

userPrivacySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IUserPrivacy>('UserPrivacy', userPrivacySchema);
