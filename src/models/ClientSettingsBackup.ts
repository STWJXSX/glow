import { Schema, model, type Document, type Types } from 'mongoose';

export interface IClientSettingsBackupEntry {
  platformId: string;
  uniqueFilename: string;
  size: number;
  data: Buffer;
  createdAt: Date;
}

export interface IClientSettingsBackup extends Document {
  discordId: string;
  accountId: string;
  displayName?: string;
  batchId: string;
  entries: IClientSettingsBackupEntry[];
  createdAt: Date;
}

const entrySchema = new Schema<IClientSettingsBackupEntry>(
  {
    platformId: { type: String, required: true },
    uniqueFilename: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const clientSettingsBackupSchema = new Schema<IClientSettingsBackup>(
  {
    discordId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    displayName: { type: String },
    batchId: { type: String, required: true, index: true },
    entries: { type: [entrySchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'client_settings_backups' },
);

clientSettingsBackupSchema.index({ discordId: 1, createdAt: -1 });

export default model<IClientSettingsBackup>('ClientSettingsBackup', clientSettingsBackupSchema);

export type ClientSettingsBackupDoc = IClientSettingsBackup & { _id: Types.ObjectId };
