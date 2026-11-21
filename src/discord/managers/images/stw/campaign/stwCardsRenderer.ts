import fs from 'fs';
import os from 'os';
import path from 'path';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import {
  buildBrandingContext,
  buildMetaLine,
  prepareAccountAvatar,
  prepareBrandIcon,
} from './stwCardBranding.ts';
import { materializeCardIcons } from './stwCardIcons.ts';
import { filterProfileByItemIds, parseProfileToCardItems } from './stwCardItems.ts';
import { computeGridCols, STW_CARD_RENDER_DEFAULTS } from './stwFortniteCard.ts';
import { clearStwCardRenderCaches, renderStwCardsGridToBuffer } from './stwSharpGrid.ts';
import type { StwImageBrandingOptions } from '../stwImageBranding.ts';
import { resolveImageDisplayName } from '../stwImageBranding.ts';
import type { StwCardsCollectionType } from './types.ts';

async function fetchCampaignProfileBody(accountId: string, accessToken: string): Promise<unknown> {
  const result = await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  });
  return result.data;
}

export { fetchCampaignProfileBody };
export interface RenderStwCardsImageInput {
  type: StwCardsCollectionType;
  accountId: string;
  accessToken: string;
  displayName: string;
  itemIds: string[];
  profileBody?: unknown;
  discordUserId?: string;
  branding?: StwImageBrandingOptions;
}
async function safeRemoveTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (attempt >= 5 || (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY')) {
        const { log } = await import('#helpers/core/logger.ts');
        log.commands.warn({ error: (err as Error)?.message, path: dir }, '[STW-CARDS] temp cleanup failed');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function renderStwCardsImage(input: RenderStwCardsImageInput): Promise<{
  buffer: Buffer;
  itemCount: number;
}> {
  const { type, accountId, accessToken, displayName, itemIds, discordUserId, branding } = input;  if (!itemIds.length) throw new Error('No items to render');

  const resolvedName = resolveImageDisplayName(displayName, branding);

  const profileBody = input.profileBody ?? await fetchCampaignProfileBody(accountId, accessToken);
  const scoped = filterProfileByItemIds(profileBody, itemIds);
  let items = parseProfileToCardItems(scoped, type);

  if (!items.length) {
    throw new Error(`No items for type "${type}" after filter`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stw-cards-'));
  const iconsDir = path.join(tmpDir, 'icons');

  let buffer: Buffer | undefined;
  let itemCount = 0;

  try {
    items = await materializeCardIcons(items, iconsDir);
    const gridCols = computeGridCols(items.length, STW_CARD_RENDER_DEFAULTS.cardSize);
    const brandingCtx = buildBrandingContext(resolvedName, accountId, branding);
    const [accountAvatarPng, brandIconPng] = await Promise.all([
      prepareAccountAvatar(accessToken, accountId, 64, discordUserId),
      prepareBrandIcon(40, branding?.footerIconUrl),
    ]);
    buffer = await renderStwCardsGridToBuffer({
      items,
      iconsDir,
      gridCols,
      cardSize: STW_CARD_RENDER_DEFAULTS.cardSize,
      cardGap: STW_CARD_RENDER_DEFAULTS.cardGap,
      title: resolvedName,
      metaLine: buildMetaLine(type, items.length),
      branding: brandingCtx,
      accountAvatarPng,
      brandIconPng,
      rowConcurrency: STW_CARD_RENDER_DEFAULTS.rowConcurrency,
    });
    itemCount = items.length;
  } finally {
    clearStwCardRenderCaches();
    await safeRemoveTempDir(tmpDir);
  }

  return { buffer: buffer!, itemCount };
}