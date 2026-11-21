export const WORLD_INFO_WIDTH = 860;
export const WORLD_INFO_HEADER_H = 54;
export const WORLD_INFO_ROW_TOP_H = 46;
export const WORLD_INFO_ROW_REWARD_H = 28;
export const WORLD_INFO_ROW_GAP = 8;
export const WORLD_INFO_ROW_PAD_BOTTOM = 8;
export const WORLD_INFO_EMPTY_H = 44;
export const WORLD_INFO_PAD = 16;
export const WORLD_INFO_BADGE = 22;
export const WORLD_INFO_BADGE_IMG = 20;
export const WORLD_INFO_MISSION_ICON = 30;
export const WORLD_INFO_MOD_SZ = 20;
export const WORLD_INFO_MOD_GAP = 3;
export const WORLD_INFO_MAX_MODS = 8;
export const WORLD_INFO_POWER_ICON = 14;
export const WORLD_INFO_POWER_BADGE_H = 18;
export const WORLD_INFO_PILL_H = 24;
export const WORLD_INFO_PILL_ICON = 20;
export const WORLD_INFO_MAX_REWARDS = 12;

export const WORLD_INFO_FOOTER_H = 94;
export const WORLD_INFO_FOOTER_GAP = 14;
export const WORLD_INFO_PAD_BOTTOM = 12;

export const WORLD_INFO_MAX_MISSIONS_PER_IMAGE = 16;
export const WORLD_INFO_MAX_OVERVIEW_IMAGES = 10;
export const WORLD_INFO_OUTPUT_WEBP = { quality: 92, effort: 1, smartSubsample: true } as const;

export const WORLD_INFO_BG = '#0a0a12';
export const WORLD_INFO_HEADER_BG = '#11111a';
export const WORLD_INFO_ROW_EVEN = '#15151f';
export const WORLD_INFO_ROW_ODD = '#111119';

export const CATEGORY_SECTION_META: Record<string, { color: string; iconResourceId: string }> = {
  vbucks: { color: '#3b82f6', iconResourceId: 'Currency_MtxSwap' },
  'legendary-survivors': { color: '#f39c12', iconResourceId: 'Voucher_Generic_Worker_SR' },
  'pl-160': { color: '#e74c3c', iconResourceId: 'red-skull' },
  'legendary-heroes': { color: '#f39c12', iconResourceId: 'Voucher_Generic_Hero_SR' },
  'legendary-defenders': { color: '#f39c12', iconResourceId: 'Voucher_Generic_Defender_SR' },
};

export const ZONE_SECTION_META: Record<string, { color: string; difficultyKey?: string; resourceId?: string; worldId?: string }> = {
  'V-Bucks': { color: '#f0b132', resourceId: 'Currency_MtxSwap' },
  'Twine Peaks': { color: '#e74c3c', difficultyKey: 'twine' },
  'Canny Valley': { color: '#e67e22', difficultyKey: 'canny' },
  Plankerton: { color: '#f1c40f', difficultyKey: 'plankerton' },
  Stonewood: { color: '#2ecc71', difficultyKey: 'stonewood' },
  Ventures: { color: '#9b59b6', difficultyKey: 'ventures' },
  Events: { color: '#00bcd4', worldId: 'quest' },
};
