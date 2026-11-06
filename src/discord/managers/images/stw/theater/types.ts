import type { StwInventoryCategory, StwInventoryRarityCode } from '#helpers/epic/stw/inventory/stwInventoryData.ts';
import type { StwCardBrandingContext } from '../campaign/types.ts';

export interface StwInventoryDisplayItem {
  templateId: string;
  nombre: string;
  cantidad: number;
  stacks: number;
  nivel: number;
  rareza: StwInventoryRarityCode | null;
  categoria: StwInventoryCategory;
  iconPath: string;
}

export interface InventoryTileDimensions {
  width: number;
  height: number;
  iconArea: number;
  footerH: number;
}

export interface RenderInventoryPageOptions {
  items: StwInventoryDisplayItem[];
  iconsDir: string;
  gridCols: number;
  tileSize: number;
  tileGap?: number;
  title: string;
  metaLine: string;
  branding?: StwCardBrandingContext | null;
  accountAvatarPng?: Buffer | null;
  brandIconPng?: Buffer | null;
  rowConcurrency?: number;
}

export const INVENTORY_RENDER_DEFAULTS = {
  tileSize: 92,
  tileGap: 4,
  gridCols: 12,
  gridRows: 11,
  maxPages: 10,
  rowConcurrency: 8,
} as const;
