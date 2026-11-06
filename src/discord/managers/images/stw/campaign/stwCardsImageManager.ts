import { AttachmentBuilder } from 'discord.js';
import { renderStwCardsImage } from './stwCardsRenderer.ts';
import type { StwImageBrandingOptions } from '../stwImageBranding.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import type { StwCardsCollectionType } from './types.ts';

export type { StwCardsCollectionType } from './types.ts';

export const STW_CARDS_FILE_NAMES: Record<StwCardsCollectionType, string> = {
  heroes: 'stw-heroes.webp',
  survivors: 'stw-survivors.webp',
  schematics: 'stw-schematics.webp',
  defenders: 'stw-defenders.webp',
};

export interface GenerateStwCollectionCardsImageInput {
  type: StwCardsCollectionType;
  items: { itemId: string }[];
  accountId: string;
  accessToken: string;
  displayName: string;
  profileBody?: unknown;
  discordUserId?: string;
  branding?: StwImageBrandingOptions;
}

export interface GenerateStwCollectionCardsImageResult {
  buffer: Buffer;
  itemCount: number;
  fileName: string;
}

/**
 * Fortnite-style STW card grid (native Sharp/WebP). Panel filters → itemIds subset.
 */
export async function generateStwCollectionCardsImage(
  input: GenerateStwCollectionCardsImageInput,
): Promise<GenerateStwCollectionCardsImageResult> {
  const { type, items, accountId, accessToken, displayName, profileBody, discordUserId, branding } = input;
  if (!items.length) throw new Error('No items to render');

  const { buffer, itemCount } = await renderStwCardsImage({
    type,
    accountId,
    accessToken,
    displayName,
    itemIds: items.map((item) => item.itemId),
    profileBody,
    discordUserId,
    branding,
  });

  return {
    buffer,
    itemCount,
    fileName: STW_CARDS_FILE_NAMES[type],
  };
}

/** CollectionImagePanelConfig.generate helper — filters already applied. */
export async function generateStwCardsPanelResult(
  type: StwCardsCollectionType,
  ctx: {
    items: { itemId: string }[];
    header: { displayName: string };
    account: { accountId: string; accessToken: string };
    profileBody?: unknown;
    discordUserId?: string;
    lang?: SupportedLanguage;
  },
): Promise<{
  attachments: AttachmentBuilder[];
  totalCount: number;
  shownCount: number;
  truncated: boolean;
  pageCount: number;
}> {
  const { buffer, itemCount, fileName } = await generateStwCollectionCardsImage({
    type,
    items: ctx.items,
    accountId: ctx.account.accountId,
    accessToken: ctx.account.accessToken,
    displayName: ctx.header.displayName,
    profileBody: ctx.profileBody,
    discordUserId: ctx.discordUserId,
    branding: ctx.lang ? { lang: ctx.lang } : undefined,
  });

  return {
    attachments: [new AttachmentBuilder(buffer, { name: fileName })],
    totalCount: itemCount,
    shownCount: itemCount,
    truncated: false,
    pageCount: 1,
  };
}
