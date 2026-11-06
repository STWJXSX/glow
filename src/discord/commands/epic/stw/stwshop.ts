import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getEmoji, getAppEmojiByName } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser, getUserLanguage } from '#helpers/locales/index.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { GOLD_EMOJI_NAME } from '#helpers/epic/stw/stwBuyableItems.ts';
import {
  getRemainingPurchases,
  type PurchaseResult,
  type STWShopData,
} from '#helpers/epic/stw/shop/stwShopOfferTypes.ts';
import {
  generateStwShopImage,
  type StwShopDisplayItem,
} from '#managers/epic/shop/generators/stwShopGenerator.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicQuote,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';

const SHOP_IMAGE_NAME = 'stw-shop.png';

function resolveGoldEmoji(client: ChatInputCommandInteraction['client']): string {
  const fromApp = getAppEmojiByName(client, GOLD_EMOJI_NAME);
  if (!fromApp.endsWith(':0>')) return fromApp;

  const fromCache = getEmoji(client, 'stw_gold');
  if (!fromCache.endsWith(':0>')) return fromCache;

  return getEmoji(client, 'stw_gold');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function isInsufficientResourcesError(err: any): boolean {
  const msg = String(err?.message || err?.errorData?.errorMessage || '').toLowerCase();
  const code = String(err?.errorCode || '').toLowerCase();
  return (
    /not.?enough|insufficient|lack|required amount|cannot afford/.test(msg)
    || /not_enough|insufficient/.test(code)
  );
}

function buildOfferMap(sections: { items: StwShopDisplayItem[] }[]): Map<string, StwShopDisplayItem> {
  const map = new Map<string, StwShopDisplayItem>();
  for (const section of sections) {
    for (const item of section.items) {
      map.set(item.offerId, item);
    }
  }
  return map;
}

function getPurchaseQuantity(offer: StwShopDisplayItem): number {
  const remaining = offer.remainingPurchases ?? getRemainingPurchases(offer);
  return Math.max(0, remaining);
}

async function buildSelectRow(
  customId: string,
  placeholderKey: string,
  items: StwShopDisplayItem[],
  userId: string,
  locale?: string | null,
): Promise<ActionRowBuilder<StringSelectMenuBuilder> | null> {
  if (!items.length) return null;

  const priceSuffix = await translateForUser(userId, 'stwshop.priceSuffix', undefined, locale);
  const placeholder = await translateForUser(userId, placeholderKey, undefined, locale);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(truncate(placeholder, 100))
    .addOptions(
      items.slice(0, 25).map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(item.displayName, 100))
          .setDescription(truncate(`${item.price.toLocaleString()} ${priceSuffix} · ${item.limitLabel || '1'}`, 100))
          .setValue(item.offerId),
      ),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

async function buildShopDescription(
  userId: string,
  gold: number,
  goldEmoji: string,
  locale?: string | null,
): Promise<string> {
  const goldLabel = await translateForUser(userId, 'stwshop.gold', undefined, locale);
  const hint = await translateForUser(userId, 'stwshop.hint', undefined, locale);
  const localeTag = locale?.startsWith('es') ? 'es-ES' : 'en-US';

  return [
    `${goldEmoji} **${gold.toLocaleString(localeTag)}** ${goldLabel}`,
    '',
    epicQuote(hint),
  ].join('\n');
}

async function replyStwShop(
  interaction: ChatInputCommandInteraction,
  userId: string,
  attachment: AttachmentBuilder,
  gold: number,
  goldEmoji: string,
  eventRow: ActionRowBuilder<StringSelectMenuBuilder> | null,
  weeklyRow: ActionRowBuilder<StringSelectMenuBuilder> | null,
  author?: Awaited<ReturnType<typeof getEpicAuthor>>,
): Promise<void> {
  const locale = interaction.locale;
  const components = [eventRow, weeklyRow].filter(Boolean) as ActionRowBuilder<StringSelectMenuBuilder>[];

  const payload = await buildEpicReplyPayload(
    userId,
    {
      style: 'info',
      title: await translateForUser(userId, 'stwshop.title', undefined, locale),
      description: await buildShopDescription(userId, gold, goldEmoji, locale),
      image: `attachment://${SHOP_IMAGE_NAME}`,
      author: author ?? undefined,
      footerKey: 'brand',
    },
    interaction,
    locale,
    [attachment],
  );

  await interaction.editReply({
    ...payload,
    components,
  });
}

async function refreshShopUI(
  interaction: ChatInputCommandInteraction,
  userId: string,
  goldEmoji: string,
  offerMap: Map<string, StwShopDisplayItem>,
  author?: Awaited<ReturnType<typeof getEpicAuthor>>,
): Promise<void> {
  const locale = interaction.locale;
  const user = await UsuarioInfo.findOne({ id: userId });
  if (!user?.deviceAuths?.length) return;

  const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
  if (!mainAccount) return;

  const { account, error: tokenError } = await refreshAccountToken(user, mainAccount.accountId);
  if (tokenError || !account) return;

  const shopData = await callCoreWithTimeout<STWShopData>('stwshop.fetch', 60_000, {
    accountId: account.accountId,
    accessToken: account.accessToken,
  });
  if (!shopData.offers.length) return;

  const { buffer, sections } = await generateStwShopImage(shopData.offers, await getUserLanguage(userId, locale));
  offerMap.clear();
  for (const [id, item] of buildOfferMap(sections)) {
    offerMap.set(id, item);
  }

  const eventItems = (sections.find((s) => s.key === 'event-items')?.items ?? [])
    .filter((item) => !item.soldOut);
  const weeklyItems = (sections.find((s) => s.key === 'weekly-items')?.items ?? [])
    .filter((item) => !item.soldOut);

  const eventRow = await buildSelectRow('stwshop_select_event', 'stwshop.selectEvent', eventItems, userId, locale);
  const weeklyRow = await buildSelectRow('stwshop_select_weekly', 'stwshop.selectWeekly', weeklyItems, userId, locale);

  const attachment = new AttachmentBuilder(buffer, { name: SHOP_IMAGE_NAME });
  await replyStwShop(interaction, userId, attachment, shopData.gold, goldEmoji, eventRow, weeklyRow, author);
}

async function handleStwShop(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const goldEmoji = resolveGoldEmoji(client);
  const offerMap = new Map<string, StwShopDisplayItem>();

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const account = mainAccount;

    const author = await getEpicAuthor(userId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: mainAccount.displayName,
    });

    const shopData = await callCoreWithTimeout<STWShopData>('stwshop.fetch', 60_000, {
      accountId: account.accountId,
      accessToken: account.accessToken,
    });
    if (!shopData.offers.length) {
      await replyEpicCustomError(interaction, userId, 'stwshop.noItems');
      return;
    }

    const userLanguage = await getUserLanguage(userId, locale);
    const { buffer, sections } = await generateStwShopImage(shopData.offers, userLanguage);
    for (const [id, item] of buildOfferMap(sections)) {
      offerMap.set(id, item);
    }

    const eventItems = (sections.find((s) => s.key === 'event-items')?.items ?? [])
      .filter((item) => !item.soldOut);
    const weeklyItems = (sections.find((s) => s.key === 'weekly-items')?.items ?? [])
      .filter((item) => !item.soldOut);

    const eventRow = await buildSelectRow('stwshop_select_event', 'stwshop.selectEvent', eventItems, userId, locale);
    const weeklyRow = await buildSelectRow('stwshop_select_weekly', 'stwshop.selectWeekly', weeklyItems, userId, locale);

    const attachment = new AttachmentBuilder(buffer, { name: SHOP_IMAGE_NAME });
    await replyStwShop(interaction, userId, attachment, shopData.gold, goldEmoji, eventRow, weeklyRow, author);

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === userId && i.customId.startsWith('stwshop_select_'),
      idle: EPIC_PANEL_IDLE_MS,
    });

    collector.on('collect', async (select) => {
      const offerId = select.values[0];
      const offer = offerMap.get(offerId);
      if (!offer) {
        await select.reply({
          content: epicEmojiLine(
            client,
            'error',
            await translateForUser(userId, 'buy.errors.cosmeticNotFound', undefined, locale),
          ),
          ephemeral: true,
        });
        return;
      }

      const maxQty = getPurchaseQuantity(offer);
      if (maxQty <= 0) {
        await select.reply({
          content: epicEmojiLine(
            client,
            'error',
            await translateForUser(userId, 'stwshop.cannotBuy', undefined, locale),
          ),
          ephemeral: true,
        });
        return;
      }

      await select.deferReply({ ephemeral: true });

      try {
        const freshUser = await UsuarioInfo.findOne({ id: userId });
        if (!freshUser?.deviceAuths?.length) throw new Error('No account');

        const main = freshUser.deviceAuths.find((acc: any) => acc.cuentaMain);
        if (!main) throw new Error('No main account');

        const { account: freshAccount, error: refreshErr } = await refreshAccountToken(freshUser, main.accountId);
        if (refreshErr || !freshAccount) throw new Error('Token refresh failed');

        const result = await callCoreWithTimeout<PurchaseResult>('stwshop.purchase', 5 * 60_000, {
          accountId: freshAccount.accountId,
          accessToken: freshAccount.accessToken,
          offer,
          count: maxQty,
        });

        if (result.purchased <= 0) {
          const detail = result.error || await translateForUser(userId, 'buy.errors.purchaseFailed', { error: 'unknown' }, locale);
          const insufficient = isInsufficientResourcesError({ message: detail });
          const message = insufficient
            ? epicEmojiLine(
              client,
              'error',
              await translateForUser(userId, 'stwshop.insufficientGold', { name: offer.displayName }, locale),
            )
            : epicEmojiLine(client, 'error', detail);

          await select.editReply({ content: message });
          return;
        }

        const countLabel = result.purchased > 1 ? ` ×${result.purchased}` : '';
        let success = epicEmojiLine(
          client,
          'success',
          await translateForUser(
            userId,
            'stwshop.success',
            {
              name: offer.displayName,
              count: countLabel,
              goldSpent: result.goldSpent.toLocaleString(),
            },
            locale,
          ),
        );

        if (
          result.purchased < maxQty
          && isInsufficientResourcesError({ message: result.error })
        ) {
          success += `\n${await translateForUser(
            userId,
            'stwshop.partialGold',
            { remaining: String(maxQty - result.purchased) },
            locale,
          )}`;
        }

        await select.editReply({ content: success });

        refreshShopUI(interaction, userId, goldEmoji, offerMap, author).catch((err) => {
          log.epic.error({ err }, '[STW Shop] Failed to refresh shop image after purchase');
        });
      } catch (err: any) {
        log.epic.error({ err, offerId }, '[STW Shop] Purchase failed');

        const insufficient = isInsufficientResourcesError(err);
        const message = insufficient
          ? epicEmojiLine(
            client,
            'error',
            await translateForUser(userId, 'stwshop.insufficientGold', { name: offer.displayName }, locale),
          )
          : epicEmojiLine(
            client,
            'error',
            err?.message || err?.errorData?.errorMessage || await translateForUser(userId, 'buy.errors.purchaseFailed', { error: 'unknown' }, locale),
          );

        await select.editReply({ content: message }).catch(() => undefined);
      }
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      const inactive = await translateForUser(userId, 'epic.inactivePanel', undefined, locale);
      await editReplyInactive(interaction, inactive).catch(() => undefined);
    });
  } catch (error: any) {
    log.epic.error({ error: error?.message || error }, '[STW Shop] Error generating shop image');
    await replyEpicCustomError(interaction, userId, 'stwshop.loadFailed');
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stwshop')
    .setDescription('Show the Save The World gold shop with purchase menus')
    .setNameLocalizations(buildDiscordLocalizations('stwshop.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('stwshop.cmd._1'))
    .setDMPermission(true),

  auth: true,
  cooldown: 15,

  async execute(interaction: ChatInputCommandInteraction) {
    await handleStwShop(interaction);
  },
};

export default command;
