import UsuarioInfo from '#models/UsuarioInfo.ts';

export const CHECKER_IMAGE_KEYS = [
  'locker_outfit',
  'locker_backpack',
  'locker_pickaxe',
  'locker_glider',
  'locker_emote',
  'locker_exclusive',
  'stw_resources',
  'stw_backpack',
  'stw_storage',
  'stw_heroes',
  'stw_survivors',
  'stw_defenders',
  'stw_schematics',
] as const;

export type CheckerImageKey = (typeof CHECKER_IMAGE_KEYS)[number];

export type CheckerImageConfig = Record<CheckerImageKey, boolean>;

export type CheckerImagePreset = 'all_on' | 'all_off' | 'locker_only' | 'stw_only';

export const DEFAULT_CHECKER_IMAGE_CONFIG: CheckerImageConfig = {
  locker_outfit: true,
  locker_backpack: true,
  locker_pickaxe: true,
  locker_glider: true,
  locker_emote: true,
  locker_exclusive: true,
  stw_resources: true,
  stw_backpack: true,
  stw_storage: true,
  stw_heroes: true,
  stw_survivors: true,
  stw_defenders: true,
  stw_schematics: true,
};

const LOCKER_KEYS: CheckerImageKey[] = [
  'locker_outfit',
  'locker_backpack',
  'locker_pickaxe',
  'locker_glider',
  'locker_emote',
  'locker_exclusive',
];

const STW_KEYS: CheckerImageKey[] = [
  'stw_resources',
  'stw_backpack',
  'stw_storage',
  'stw_heroes',
  'stw_survivors',
  'stw_defenders',
  'stw_schematics',
];

export const CHECKER_IMAGE_CHOICES = CHECKER_IMAGE_KEYS.map((key) => ({
  name: key.replace(/_/g, ' '),
  value: key,
}));

export const CHECKER_IMAGE_PRESET_CHOICES: { name: string; value: CheckerImagePreset }[] = [
  { name: 'All on', value: 'all_on' },
  { name: 'All off', value: 'all_off' },
  { name: 'Locker only', value: 'locker_only' },
  { name: 'STW only', value: 'stw_only' },
];

export function mergeCheckerImageConfig(
  partial?: Partial<CheckerImageConfig> | null,
): CheckerImageConfig {
  return { ...DEFAULT_CHECKER_IMAGE_CONFIG, ...(partial ?? {}) };
}

export function applyCheckerImagePreset(preset: CheckerImagePreset): CheckerImageConfig {
  switch (preset) {
    case 'all_off':
      return Object.fromEntries(CHECKER_IMAGE_KEYS.map((key) => [key, false])) as CheckerImageConfig;
    case 'locker_only':
      return mergeCheckerImageConfig(
        Object.fromEntries([
          ...LOCKER_KEYS.map((key) => [key, true]),
          ...STW_KEYS.map((key) => [key, false]),
        ]) as Partial<CheckerImageConfig>,
      );
    case 'stw_only':
      return mergeCheckerImageConfig(
        Object.fromEntries([
          ...LOCKER_KEYS.map((key) => [key, false]),
          ...STW_KEYS.map((key) => [key, true]),
        ]) as Partial<CheckerImageConfig>,
      );
    case 'all_on':
    default:
      return { ...DEFAULT_CHECKER_IMAGE_CONFIG };
  }
}

export async function getCheckerImageConfig(userId: string): Promise<CheckerImageConfig> {
  const user = await UsuarioInfo.findOne({ id: userId }).select('checkerImageConfig').lean();
  return mergeCheckerImageConfig(
    (user?.checkerImageConfig as Partial<CheckerImageConfig> | undefined) ?? undefined,
  );
}

export async function saveCheckerImageConfig(
  userId: string,
  config: CheckerImageConfig,
): Promise<void> {
  await UsuarioInfo.updateOne(
    { id: userId },
    { $set: { checkerImageConfig: config } },
    { upsert: false },
  );
}

export function isCheckerImageEnabled(
  config: CheckerImageConfig,
  key: CheckerImageKey,
): boolean {
  return config[key] !== false;
}
