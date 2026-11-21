import { Schema, model, Document } from 'mongoose';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../discord/helpers/locales/languages.ts';

export type { SupportedLanguage };

export interface IUserLocale extends Document {
  discordId: string;
  lang: SupportedLanguage;
  updatedAt: Date;
}

const userLocaleSchema = new Schema<IUserLocale>({
  discordId: { type: String, required: true, unique: true },
  lang: { type: String, enum: SUPPORTED_LANGUAGES, default: 'en' },
  updatedAt: { type: Date, default: Date.now },
});

userLocaleSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IUserLocale>('UserLocale', userLocaleSchema);
