import { Schema, model, Document } from 'mongoose';

export interface IPremiumAccountGrace extends Document {
  discordId: string;
  graceUntil: Date;
  warningSent: boolean;
  excessAccounts: number;
  excessTaxi: number;
  createdAt: Date;
}

const premiumAccountGraceSchema = new Schema<IPremiumAccountGrace>({
  discordId: { type: String, required: true, unique: true, index: true },
  graceUntil: { type: Date, required: true, index: true },
  warningSent: { type: Boolean, default: false },
  excessAccounts: { type: Number, default: 0 },
  excessTaxi: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default model<IPremiumAccountGrace>('PremiumAccountGrace', premiumAccountGraceSchema);
