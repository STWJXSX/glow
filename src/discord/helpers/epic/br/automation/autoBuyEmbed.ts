import type { Client, EmbedBuilder } from 'discord.js';
import type { ExtendedClient } from '#structures/types.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicEmbed,
  epicQuote,
  epicSection,
  getEpicAuthor,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

export interface AutoBuyItemSnapshot {
  itemName: string;
  itemType: string;
  itemRarity: string;
  finalPrice: number;
  itemImage?: string | null;
}

export interface AutoBuyAccountContext {
  displayName: string;
  accountId: string;
  accessToken: string;
}

function asInteractionStub(client: Client) {
  return { client, locale: null } as unknown as Parameters<typeof buildEpicEmbed>[2];
}

export async function formatShopItemDetails(
  discordId: string,
  item: AutoBuyItemSnapshot,
  lang: Awaited<ReturnType<typeof getUserLanguage>>,
  keyPrefix: string,
): Promise<string[]> {
  const typeLabel = await translateForUser(discordId, `${keyPrefix}.label_type`, undefined, lang);
  const rarityLabel = await translateForUser(discordId, `${keyPrefix}.label_rarity`, undefined, lang);
  const priceLabel = await translateForUser(discordId, `${keyPrefix}.label_price`, undefined, lang);

  const priceText =
    item.finalPrice > 0
      ? await translateForUser(discordId, `${keyPrefix}.price_vbucks`, { amount: item.finalPrice }, lang)
      : await translateForUser(discordId, `${keyPrefix}.price_free`, undefined, lang);

  return [
    epicSection(item.itemName),
    epicQuote(`${typeLabel}: **${item.itemType}**`),
    epicQuote(`${rarityLabel}: **${item.itemRarity}**`),
    epicQuote(`${priceLabel}: **${priceText}**`),
  ];
}

export async function buildAutoBuySelectedNotificationEmbed(
  client: ExtendedClient,
  discordId: string,
  input: {
    kind: 'success' | 'error';
    account: AutoBuyAccountContext;
    item: AutoBuyItemSnapshot;
    errorMessage?: string;
  },
): Promise<EmbedBuilder> {
  const lang = await getUserLanguage(discordId);
  const stub = asInteractionStub(client);
  const keyPrefix = 'autobuySelected.dm';

  const author = await getEpicAuthor(discordId, {
    accountId: input.account.accountId,
    accessToken: input.account.accessToken,
    displayName: input.account.displayName,
  });

  const descriptionKey =
    input.kind === 'success' ? `${keyPrefix}.description_success` : `${keyPrefix}.description_error`;

  const lines = [
    await translateForUser(discordId, descriptionKey, {
      itemName: input.item.itemName,
      account: input.account.displayName,
    }, lang),
    ...await formatShopItemDetails(discordId, input.item, lang, keyPrefix),
  ];

  if (input.kind === 'error' && input.errorMessage) {
    const reasonLabel = await translateForUser(discordId, `${keyPrefix}.label_reason`, undefined, lang);
    lines.push('', epicSection(reasonLabel), epicQuote(input.errorMessage));
    lines.push('', epicQuote(await translateForUser(discordId, `${keyPrefix}.error_hint`, undefined, lang)));
  }

  lines.push('', epicQuote(await translateForUser(discordId, `${keyPrefix}.removed_notice`, undefined, lang)));

  const titleKey = input.kind === 'success' ? `${keyPrefix}.title_success` : `${keyPrefix}.title_error`;

  return buildEpicEmbed(
    discordId,
    {
      style: input.kind === 'success' ? 'success' : 'error',
      title: await translateForUser(discordId, titleKey, undefined, lang),
      description: lines.join('\n'),
      author,
      thumbnail: input.item.itemImage ?? undefined,
      footerKey: 'brand',
    },
    stub,
    lang,
  );
}

export async function buildAutoBuyFreeNotificationEmbed(
  client: ExtendedClient,
  discordId: string,
  input: {
    account: AutoBuyAccountContext;
    item: AutoBuyItemSnapshot;
  },
): Promise<EmbedBuilder> {
  const lang = await getUserLanguage(discordId);
  const stub = asInteractionStub(client);
  const keyPrefix = 'autobuyfreeitems.dm.success';

  const author = await getEpicAuthor(discordId, {
    accountId: input.account.accountId,
    accessToken: input.account.accessToken,
    displayName: input.account.displayName,
  });

  const lines = [
    await translateForUser(discordId, `${keyPrefix}.description`, {
      itemName: input.item.itemName,
      itemType: input.item.itemType,
      displayName: input.account.displayName,
    }, lang),
    ...await formatShopItemDetails(discordId, input.item, lang, keyPrefix),
  ];

  return buildEpicEmbed(
    discordId,
    {
      style: 'success',
      title: await translateForUser(discordId, `${keyPrefix}.title`, undefined, lang),
      description: lines.join('\n'),
      author,
      thumbnail: input.item.itemImage ?? undefined,
      footerKey: 'brand',
    },
    stub,
    lang,
  );
}
