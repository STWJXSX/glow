export const CLIENT_SETTINGS_PLATFORM_ALL = 'all';

export interface ClientSettingsPlatformDef {
  id: string;
  label: string;
  uploadFilename: string;
  matchNames: string[];
}

export const CLIENT_SETTINGS_PLATFORMS: ClientSettingsPlatformDef[] = [
  {
    id: 'pc',
    label: 'PC (Windows)',
    uploadFilename: 'ClientSettings.Sav',
    matchNames: ['ClientSettings.Sav', 'ClientSettings.sav'],
  },
  { id: 'mac', label: 'macOS', uploadFilename: 'ClientSettingsMac.sav', matchNames: ['ClientSettingsMac.sav'] },
  { id: 'linux', label: 'Linux', uploadFilename: 'ClientSettingsLinux.sav', matchNames: ['ClientSettingsLinux.sav'] },
  { id: 'android', label: 'Android', uploadFilename: 'ClientSettingsAndroid.sav', matchNames: ['ClientSettingsAndroid.sav'] },
  { id: 'ios', label: 'iOS', uploadFilename: 'ClientSettingsIOS.sav', matchNames: ['ClientSettingsIOS.sav'] },
  { id: 'ps4', label: 'PlayStation 4', uploadFilename: 'ClientSettingsPS4.sav', matchNames: ['ClientSettingsPS4.sav'] },
  { id: 'ps5', label: 'PlayStation 5', uploadFilename: 'ClientSettingsPS5.sav', matchNames: ['ClientSettingsPS5.sav'] },
  { id: 'xbox_one', label: 'Xbox One', uploadFilename: 'ClientSettingsXboxOne.sav', matchNames: ['ClientSettingsXboxOne.sav'] },
  { id: 'xsx', label: 'Xbox Series X|S', uploadFilename: 'ClientSettingsXSX.sav', matchNames: ['ClientSettingsXSX.sav'] },
  {
    id: 'xsx_helios',
    label: 'Xbox Helios',
    uploadFilename: 'ClientSettingsXSXHelios.Sav',
    matchNames: ['ClientSettingsXSXHelios.Sav', 'ClientSettingsXSXHelios.sav'],
  },
  {
    id: 'xsx_helios_mobile',
    label: 'Xbox Helios Mobile',
    uploadFilename: 'ClientSettingsXSXHeliosMobile.sav',
    matchNames: ['ClientSettingsXSXHeliosMobile.sav'],
  },
  { id: 'switch', label: 'Nintendo Switch', uploadFilename: 'ClientSettingsSalmon.sav', matchNames: ['ClientSettingsSalmon.sav'] },
  { id: 'gfn', label: 'GeForce NOW', uploadFilename: 'ClientSettingsGFN.sav', matchNames: ['ClientSettingsGFN.sav'] },
  {
    id: 'gfn_mobile',
    label: 'GeForce NOW Mobile',
    uploadFilename: 'ClientSettingsGFNMobile.sav',
    matchNames: ['ClientSettingsGFNMobile.sav'],
  },
  { id: 'luna', label: 'Amazon Luna', uploadFilename: 'ClientSettingsLuna.sav', matchNames: ['ClientSettingsLuna.sav'] },
  {
    id: 'luna_mobile',
    label: 'Amazon Luna Mobile',
    uploadFilename: 'ClientSettingsLunaMobile.sav',
    matchNames: ['ClientSettingsLunaMobile.sav'],
  },
];

const byId = new Map(CLIENT_SETTINGS_PLATFORMS.map((p) => [p.id, p]));

export function getClientSettingsPlatform(id: string): ClientSettingsPlatformDef | undefined {
  return byId.get(id);
}

export function isAllPlatformsId(id: string): boolean {
  return id === CLIENT_SETTINGS_PLATFORM_ALL;
}

export function normalizeCloudFilename(name: string): string {
  return name.trim().toLowerCase();
}

export function platformMatchesFilename(platform: ClientSettingsPlatformDef, uniqueFilename: string): boolean {
  const n = normalizeCloudFilename(uniqueFilename);
  return platform.matchNames.some((m) => normalizeCloudFilename(m) === n);
}
