import type { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';

/**
 * Tipos para el Shop Manager (sharp-based, sin canvas)
 */

/** Variante de contenido al generar la imagen de tienda. */
export type ShopContentFilter = 'full' | 'no_jam_tracks' | 'jam_tracks_only';

export type ShopImageVariant = ShopContentFilter;

/** Tipo de cosmético BR para filtrar la imagen de tienda (fortnite-api `type.value`). */
export type ShopCosmeticType =
  | 'outfit'
  | 'backpack'
  | 'pickaxe'
  | 'glider'
  | 'emote'
  | 'spray'
  | 'emoji'
  | 'wrap'
  | 'contrail'
  | 'loadingscreen'
  | 'shoe'
  | 'sidekick'
  | 'vehicle'
  | 'bundle';

/** Tipos de cosmético soportados en el filtro de imagen de tienda. */
export const SHOP_COSMETIC_TYPES: readonly ShopCosmeticType[] = [
  'outfit',
  'backpack',
  'pickaxe',
  'glider',
  'emote',
  'spray',
  'emoji',
  'wrap',
  'contrail',
  'loadingscreen',
  'shoe',
  'sidekick',
  'vehicle',
  'bundle',
] as const;

export interface ShopOptions {
  itemsPerRow?: number;
  cardWidth?: number;
  cardHeight?: number;
  cardMargin?: number;
  maxSectionsPerColumn?: number;
  maxRowsPerColumn?: number;
  columnSpacing?: number;
  rowSpacing?: number;
  sectionHeaderHeight?: number;
  sectionSpacing?: number;
  headerFontSize?: number;
  enableSectionHeaders?: boolean;
  backgroundColor?: string;
  showMainHeader?: boolean;
  mainHeaderHeight?: number;
  shopTitleFontSize?: number;
  dateFontSize?: number;
  discountTagWidth?: number;
  discountTagHeight?: number;
  discountTagFontSize?: number;
  enableImageMargins?: boolean;
  imageSideMargin?: number;
  imageBottomMargin?: number;
  contentFilter?: ShopContentFilter;
  cosmeticType?: ShopCosmeticType | null;
  /** Interactive command path — skip long cache warmup waits on WebPlatform API. */
  interactive?: boolean;
}

export interface ShopPage {
  buffer: Buffer;
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
  sectionName: string;
  /** Public HTTPS URL when hosted on glowhaven / R2 (Discord embed). */
  imageUrl?: string;
}

export interface ShopSection {
  name: string;
  entries: ShopEntry[];
}

export interface ShopEntry {
  brItems: BRItem[];
  bundle?: BundleItem;
  layout?: {
    id: string;
    name: string;
  };
  layoutId?: string;
  finalPrice: number;
  regularPrice?: number;
}

export interface BRItem {
  id: string;
  name: string;
  description?: string;
  type: {
    value: string;
    displayValue: string;
  };
  rarity: {
    value: string;
    displayValue: string;
  };
  series?: {
    value: string;
    name: string;
    colors?: string[];
  };
  images: {
    icon?: string;
    featured?: string;
    smallIcon?: string;
  };
}

export interface BundleItem extends BRItem {
  // Bundle específico
}

export interface ProcessedCard {
  index: number;
  cosmetic: BRItem | BundleItem;
  imageBuffer: Buffer;
  price: number;
  regularPrice?: number;
  finalPrice?: number;
  rarity: string;
  seriesColors: string[] | null;
}

export interface ProcessedSection {
  name: string;
  cards: ProcessedCard[];
}

export interface LayoutColumn {
  sections: Array<{
    section: ProcessedSection;
    startY: number;
    height: number;
  }>;
  startX: number;
  width: number;
}

export interface ShopLayout {
  columns: LayoutColumn[];
  canvasWidth: number;
  canvasHeight: number;
}

export interface RarityColors {
  [key: string]: string[];
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}
