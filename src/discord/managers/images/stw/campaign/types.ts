import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import type { StwRarity } from '#helpers/epic/stw/shop/stwShopCatalog.ts';

export type StwCardsCollectionType = 'heroes' | 'survivors' | 'schematics' | 'defenders';

export interface StwCardDisplayItem {
  itemId: string;
  templateId: string;
  level: number;
  quantity: number;
  rarity: StwRarity;
  tier: number;
  isManager: boolean;
  favorite: boolean;
  /** e.g. hero:commando, schematic:assault, defender:sniper, survivor:manager_doctor */
  typeKey: string;
  powerLevel: number;
  iconSrc: string | null;
  iconFileName?: string;
  iconOk?: boolean;
}

export interface StwCardBrandingContext {
  displayName: string;
  accountId: string;
  lang?: SupportedLanguage;
  footerIconUrl?: string | null;
}

export interface CardTheme {
  top: string;
  mid: string;
  bottom: string;
  glow: string;
  border: string;
  accent: string;
  vignette: string;
  sheen: string;
  footer: string;
}

export interface CardDimensions {
  width: number;
  height: number;
  portraitSize: number;
  footerH: number;
}

export interface BrandingMetrics {
  headerH: number;
  watermarkH: number;
  avatarSize: number;
  iconSize: number;
  titleFont: number;
  metaFont: number;
  dateFont: number;
  inviteFont: number;
  avatarTop: number;
  iconTop: number;
  avatarGap: number;
  iconGap: number;
  ruleOffset: number;
  strokeWidth: number;
}
