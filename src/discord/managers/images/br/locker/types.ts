import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import type { LockerPerf } from './lockerPerf.ts';

export type LockerCosmeticType =
  | 'outfit'
  | 'backpack'
  | 'pickaxe'
  | 'glider'
  | 'emote'
  | 'spray'
  | 'emoticon'
  | 'toy'
  | 'wrap'
  | 'music'
  | 'loadingscreen'
  | 'contrail'
  | 'companion'
  | 'shoes'
  | 'vehicle';

export type LockerCosmeticTypeFilter = LockerCosmeticType | 'all';

export interface RawLockerCosmetic {
  id: string;
  templateId: string;
  type: LockerCosmeticType;
  backendValue: string;
  needsValidation?: boolean;
  needsEidResolve?: boolean;
  isFavorite?: boolean;
}

export interface LockerDisplayCosmetic {
  id: string;
  name: string;
  type: LockerCosmeticType;
  themeKey: string;
  iconUrl: string | null;
  isExclusive: boolean;
  isFavorite?: boolean;
  added?: string;
}

export interface LockerBrandingContext {
  displayName: string;
  accountId: string;
  dateLabel: string;
  siteUrl: string;
}

export type LockerHeaderIconKey = LockerCosmeticType | 'fallback' | 'exclusives';

export interface GenerateLockerImageOptions {
  profileBody: unknown;
  lang: SupportedLanguage;
  types?: LockerCosmeticTypeFilter[];
  displayName?: string;
  accountId?: string;
  accessToken?: string;
  discordUserId?: string;
  categoryType?: LockerCosmeticType;
  /** Header tab icon when filter is exclusives-only. */
  exclusiveOnly?: boolean;
  /** When set, only these cosmetic ids (lowercase) are rendered. */
  allowedIds?: ReadonlySet<string>;
  siteUrl?: string;
  footerIconUrl?: string;
}

export interface LockerPageResult {
  buffer: Buffer;
  itemCount: number;
  pageIndex: number;
  pageCount: number;
  gridCols: number;
}

export interface GenerateLockerImageResult {
  buffer: Buffer;
  pages: LockerPageResult[];
  itemCount: number;
  exclusiveCount: number;
  fileName: string;
  gridCols: number;
}

export interface LockerPortraitEntry {
  buf: Buffer;
  w: number;
  h: number;
}

/** Per-render scratch maps — GC'd after each image, not kept in process RAM. */
export interface LockerPageScratch {
  portraits: Map<string, LockerPortraitEntry>;
  labels: Map<string, Buffer>;
  backgrounds: Map<string, Buffer>;
  nameBar: Buffer | null;
}

export function createLockerPageScratch(): LockerPageScratch {
  return { portraits: new Map(), labels: new Map(), backgrounds: new Map(), nameBar: null };
}

export interface RenderLockerPageOptions {
  items: LockerDisplayCosmetic[];
  gridCols: number;
  tileSize: number;
  tileGap: number;
  categoryType: LockerCosmeticType;
  headerIconKey: LockerHeaderIconKey;
  lang: SupportedLanguage;
  branding: LockerBrandingContext | null;
  brandIconPng: Buffer | null;
  accountAvatarPng?: Buffer | null;
  rowConcurrency?: number;
  tileConcurrency?: number;
  perf?: LockerPerf | null;
  scratch: LockerPageScratch;
}
