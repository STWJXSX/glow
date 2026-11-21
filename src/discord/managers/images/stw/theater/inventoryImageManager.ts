import { AttachmentBuilder } from 'discord.js';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import {
  type StwInventoryItem,
  type StwInventorySource,
  sortInventoryItems,
} from '#helpers/epic/stw/inventory/stwInventoryData.ts';
import {
  buildBrandingContext,
  prepareAccountAvatar,
  prepareBrandIcon,
} from '../campaign/stwCardBranding.ts';
import type { StwImageBrandingOptions } from '../stwImageBranding.ts';
import { resolveImageDisplayName } from '../stwImageBranding.ts';
import { resolveTheaterInventoryIcon } from './inventoryAssetResolver.ts';
import { chunkItems } from './inventoryTile.ts';
import { clearInventoryRenderCaches, renderInventoryPageToBuffer } from './inventorySharpGrid.ts';
import { INVENTORY_RENDER_DEFAULTS, type StwInventoryDisplayItem } from './types.ts';

export interface StwInventoryImagePage {
  buffer: Buffer;
  fileName: string;
  itemCount: number;
}

export interface StwInventoryImageResult {
  pages: StwInventoryImagePage[];
  totalCount: number;
  truncated: boolean;
}

export interface GenerateStwInventoryImageOptions {
  items: StwInventoryItem[];
  source: StwInventorySource;
  lang: SupportedLanguage;
  displayName?: string;
  accountId?: string;
  accessToken?: string;
  discordUserId?: string;
  branding?: StwImageBrandingOptions;
}

export const STW_INVENTORY_FILE_NAME = 'stw-inventory.webp';

function mapDisplayItems(items: StwInventoryItem[]): StwInventoryDisplayItem[] {
  return items
    .map((item) => {
      const iconPath = resolveTheaterInventoryIcon(item.templateId);
      if (!iconPath) return null;
      return {
        templateId: item.templateId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        stacks: item.stacks,
        nivel: item.nivel,
        rareza: item.rareza,
        categoria: item.categoria,
        iconPath,
      };
    })
    .filter((item): item is StwInventoryDisplayItem => item !== null);
}

function computePagination(totalCount: number): {
  itemsPerPage: number;
  maxRenderable: number;
  truncated: boolean;
} {
  const { gridCols, gridRows, maxPages } = INVENTORY_RENDER_DEFAULTS;
  const perPage = gridCols * gridRows;
  if (totalCount <= perPage) {
    return { itemsPerPage: totalCount, maxRenderable: totalCount, truncated: false };
  }
  const maxRenderable = perPage * maxPages;
  return { itemsPerPage: perPage, maxRenderable, truncated: totalCount > maxRenderable };
}

export async function generateStwInventoryImage(
  itemsOrOptions: StwInventoryItem[] | GenerateStwInventoryImageOptions,
  sourceArg?: StwInventorySource,
  langArg?: SupportedLanguage,
): Promise<StwInventoryImageResult> {
  const options: GenerateStwInventoryImageOptions = Array.isArray(itemsOrOptions)
    ? { items: itemsOrOptions, source: sourceArg!, lang: langArg! }
    : itemsOrOptions;

  const { items, displayName, accountId, accessToken, discordUserId, branding } = options;
  const resolvedName = displayName ? resolveImageDisplayName(displayName, branding) : undefined;
  const displayItems = mapDisplayItems(sortInventoryItems(items));
  const totalCount = displayItems.length;
  if (!totalCount) throw new Error('No displayable inventory items');

  const { itemsPerPage, maxRenderable, truncated } = computePagination(totalCount);
  const slice = truncated ? displayItems.slice(0, maxRenderable) : displayItems;
  const pageChunks = chunkItems(slice, itemsPerPage);
  const pageCount = pageChunks.length;
  const gridCols = INVENTORY_RENDER_DEFAULTS.gridCols;

  const brandingCtx = resolvedName && accountId
    ? buildBrandingContext(resolvedName, accountId, { ...branding, lang: options.lang })
    : null;
  const [accountAvatarPng, brandIconPng] = brandingCtx && accessToken && accountId
    ? await Promise.all([
      prepareAccountAvatar(accessToken, accountId, 64, discordUserId),
      prepareBrandIcon(40, branding?.footerIconUrl),
    ])
    : [null, null];

  const headerTitle = resolvedName ?? 'Inventory';
  const pages: StwInventoryImagePage[] = [];

  try {
    for (let i = 0; i < pageChunks.length; i++) {
      const pageItems = pageChunks[i]!;

      const buffer = await renderInventoryPageToBuffer({
        items: pageItems,
        iconsDir: '',
        gridCols,
        tileSize: INVENTORY_RENDER_DEFAULTS.tileSize,
        tileGap: INVENTORY_RENDER_DEFAULTS.tileGap,
        title: headerTitle,
        metaLine: '',
        branding: brandingCtx,
        accountAvatarPng,
        brandIconPng,
        rowConcurrency: INVENTORY_RENDER_DEFAULTS.rowConcurrency,
      });

      pages.push({
        buffer,
        fileName: pageCount === 1 ? STW_INVENTORY_FILE_NAME : `stw-inventory-${i + 1}.webp`,
        itemCount: pageItems.length,
      });
    }
  } finally {
    clearInventoryRenderCaches();
  }

  return { pages, totalCount, truncated };
}

/** Panel helper — filters already applied (same pattern as heroes/schematics). */
export async function generateStwInventoryPanelResult(ctx: {
  items: StwInventoryItem[];
  source: StwInventorySource;
  lang: SupportedLanguage;
  header: { displayName: string };
  account: { accountId: string; accessToken: string };
  discordUserId?: string;
}): Promise<{
  attachments: AttachmentBuilder[];
  totalCount: number;
  shownCount: number;
  truncated: boolean;
  pageCount: number;
}> {
  const { pages, totalCount, truncated } = await generateStwInventoryImage({
    items: ctx.items,
    source: ctx.source,
    lang: ctx.lang,
    displayName: ctx.header.displayName,
    accountId: ctx.account.accountId,
    accessToken: ctx.account.accessToken,
    discordUserId: ctx.discordUserId,
  });

  const shownCount = pages.reduce((sum, page) => sum + page.itemCount, 0);

  return {
    attachments: pages.map((page, index) => new AttachmentBuilder(page.buffer, {
      name: pages.length === 1 ? STW_INVENTORY_FILE_NAME : `stw-inventory-${index + 1}.webp`,
    })),
    totalCount,
    shownCount,
    truncated,
    pageCount: pages.length,
  };
}
