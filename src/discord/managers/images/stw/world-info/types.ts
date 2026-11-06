import type { StwImageBrandingOptions } from '../stwImageBranding.ts';

export interface WorldInfoRewardIcon {
  iconPath: string | null;
  quantity: number;
  itemType: string;
  rarityBorderColor: string | null;
}

export interface WorldInfoModifierIcon {
  iconPath: string | null;
}

export interface WorldInfoMissionRow {
  id: string;
  power: number;
  zone: string;
  zoneGeo: string;
  /** Short zone tag like launcher home (`Twine Peaks`, `Ventures`, …). */
  zoneLabel: string;
  /** Zone key used for letter/image badge (V-Bucks → zoneGeo). */
  zoneBadgeZone: string;
  missionName: string;
  missionIconPath: string | null;
  hasAlerts: boolean;
  modifiers: WorldInfoModifierIcon[];
  rewards: WorldInfoRewardIcon[];
}

export interface WorldInfoSectionInput {
  title: string;
  color: string;
  sectionIconPath?: string | null;
  missions: WorldInfoMissionRow[];
  branding?: Pick<StwImageBrandingOptions, 'siteUrl' | 'footerIconUrl'>;
}

export interface WorldInfoSectionImageResult {
  buffer: Buffer;
  fileName: string;
  filePath: string;
  missionCount: number;
}

export interface WorldInfoViewState {
  view: string;
  page: number;
  expandedCat: string;
}

export interface GenerateStwWorldInfoViewImagesOptions {
  zones: import('#helpers/epic/stw/alerts/alertsHelper.ts').ZoneMissions[];
  state: WorldInfoViewState;
  lang: import('#helpers/locales/languages.ts').SupportedLanguage;
  categoryTitles?: Record<string, string>;
  zoneTitles?: Record<string, string>;
  branding?: Pick<StwImageBrandingOptions, 'siteUrl' | 'footerIconUrl'>;
  missionsPerPage?: number;
}
