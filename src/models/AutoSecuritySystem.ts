import { Schema, model, Document } from 'mongoose';

export interface IAutoSecuritySettings {
  watchExternalAuths: boolean;
  watch2fa: boolean;
  watchEmailVerified: boolean;
  watchDisplayName: boolean;
  watchLoginActivity: boolean;
  watchGeoOnKnownDevices: boolean;
  watchRemovedDevices: boolean;
  panicMode: boolean;
  killOtherSessionsOnRevoke: boolean;
}

export interface IAccountSecuritySnapshot {
  knownDeviceIds: string[];
  externalAuthKeys: string[];
  tfaEnabled: boolean;
  emailVerified: boolean;
  country: string;
  lastLogin: string;
  displayName: string;
  numberOfDisplayNameChanges: number;
  knownCountries: string[];
  deviceLastLocations: Record<string, string>;
}

export interface IAccountSecurity {
  isActive: boolean;
  accountId: string;
  knownDeviceIds?: string[];
  settings?: Partial<IAutoSecuritySettings>;
  snapshot?: Partial<IAccountSecuritySnapshot>;
  lastChecked: Date;
  createdAt: Date;
  lastActivity: Date;
  suspended?: boolean;
  suspendedReason?: string;
}

export interface IAutoSecuritySystem extends Document {
  discordId: string;
  accounts: Map<string, IAccountSecurity>;
  updatedAt: Date;
}

const snapshotSchema = {
  knownDeviceIds: { type: [String], default: [] },
  externalAuthKeys: { type: [String], default: [] },
  tfaEnabled: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  country: { type: String, default: '' },
  lastLogin: { type: String, default: '' },
  displayName: { type: String, default: '' },
  numberOfDisplayNameChanges: { type: Number, default: 0 },
  knownCountries: { type: [String], default: [] },
  deviceLastLocations: { type: Map, of: String, default: {} },
};

const settingsSchema = {
  watchExternalAuths: { type: Boolean, default: true },
  watch2fa: { type: Boolean, default: true },
  watchEmailVerified: { type: Boolean, default: true },
  watchDisplayName: { type: Boolean, default: true },
  watchLoginActivity: { type: Boolean, default: true },
  watchGeoOnKnownDevices: { type: Boolean, default: true },
  watchRemovedDevices: { type: Boolean, default: false },
  panicMode: { type: Boolean, default: false },
  killOtherSessionsOnRevoke: { type: Boolean, default: true },
};

const autoSecuritySystemSchema = new Schema<IAutoSecuritySystem>({
  discordId: {
    type: String,
    required: true,
    unique: true,
  },
  accounts: {
    type: Map,
    of: {
      isActive: { type: Boolean, default: false },
      accountId: { type: String, required: true },
      knownDeviceIds: { type: [String], default: [] },
      settings: { type: settingsSchema, default: () => ({}) },
      snapshot: { type: snapshotSchema, default: () => ({}) },
      lastChecked: { type: Date, default: Date.now },
      createdAt: { type: Date, default: Date.now },
      lastActivity: { type: Date, default: Date.now },
      suspended: { type: Boolean, default: false },
      suspendedReason: { type: String, default: '' },
    },
    default: new Map(),
  },
  updatedAt: { type: Date, default: Date.now },
});

autoSecuritySystemSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default model<IAutoSecuritySystem>('AutoSecuritySystem', autoSecuritySystemSchema);
