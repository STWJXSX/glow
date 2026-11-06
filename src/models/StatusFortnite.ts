import { Schema, model, Document } from 'mongoose';

export interface IStatusFortnite extends Document {
  discordId: string;
  accountId: string;
  mensaje: string;
  plataforma: string;
  presenceMode: string;
  activo: boolean;
  lastUpdate: Date;
}

const statusSchema = new Schema<IStatusFortnite>({
  discordId: { type: String, required: true },
  accountId: { type: String, required: true },
  mensaje: { type: String, required: true },
  plataforma: { type: String, required: true, default: 'AND' },
  presenceMode: { type: String, required: true, default: 'online' },
  activo: { type: Boolean, default: true },
  lastUpdate: { type: Date, default: Date.now },
});

statusSchema.index({ discordId: 1, accountId: 1 }, { unique: true });

export default model<IStatusFortnite>('StatusFortnite', statusSchema);
