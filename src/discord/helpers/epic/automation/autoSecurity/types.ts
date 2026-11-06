export interface DeviceAuthEntry {
  deviceId: string;
  location: string;
  ipAddress: string;
  dateTime: string;
  userAgent: string;
}

export type AutoSecurityAlertKind =
  | 'new_device'
  | 'removed_device'
  | 'external_auth_added'
  | 'external_auth_removed'
  | 'tfa_changed'
  | 'email_verified_changed'
  | 'display_name_changed'
  | 'last_login_changed'
  | 'account_country_changed'
  | 'known_device_new_location';

import type {
  IAccountSecuritySnapshot,
  IAutoSecuritySettings,
} from '#models/AutoSecuritySystem.ts';

export type { IAccountSecuritySnapshot, IAutoSecuritySettings };

export interface AutoSecurityAlertPayload {
  kind: AutoSecurityAlertKind;
  displayName: string;
  device?: DeviceAuthEntry;
  detail?: string;
  previous?: string;
  current?: string;
}

export const DEFAULT_AUTO_SECURITY_SETTINGS: IAutoSecuritySettings = {
  watchExternalAuths: true,
  watch2fa: true,
  watchEmailVerified: true,
  watchDisplayName: true,
  watchLoginActivity: true,
  watchGeoOnKnownDevices: true,
  watchRemovedDevices: false,
  panicMode: false,
  killOtherSessionsOnRevoke: true,
};

export function emptySnapshot(): IAccountSecuritySnapshot {
  return {
    knownDeviceIds: [],
    externalAuthKeys: [],
    tfaEnabled: false,
    emailVerified: false,
    country: '',
    lastLogin: '',
    displayName: '',
    numberOfDisplayNameChanges: 0,
    knownCountries: [],
    deviceLastLocations: {},
  };
}
