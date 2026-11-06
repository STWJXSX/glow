/**
 * COMANDO /GIFTS
 * Subcomandos:
 *  - enable / disable → activa/desactiva la recepción de regalos
 *  - info → muestra historial de regalos recibidos (Components V2)
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import axios from 'axios';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser, toFortniteApiLanguage } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import type { Command } from '#structures/types.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  translateEpic,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PAGINATION_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';

// ── Types ────────────────────────────────────────────────────

interface GiftCosmetic {
  templateId: string;
  name: string;
  imageUrl: string | null;
  giftedDate: string | null;
}

interface GiftSender {
  accountId: string;
  displayName: string;
  cosmetics: GiftCosmetic[];
  lastGiftDate: string | null;
}

// ── Helpers ──────────────────────────────────────────────────

const ITEMS_PER_PAGE = 5;

/** Fetch cosmetic names from fortnite-api.com (supports all 18 bot language codes). */
async function fetchCosmeticMap(lang: SupportedLanguage): Promise<Map<string, { name: string; image: string | null }>> {
  const map = new Map<string, { name: string; image: string | null }>();
  const apiLang = toFortniteApiLanguage(lang);
  try {
    const { data } = await axios.get(`https://fortnite-api.com/v2/cosmetics/br?language=${apiLang}`, { timeout: 15000 });
    for (const item of data?.data ?? []) {
      map.set(item.id.toLowerCase(), {
        name: item.name ?? item.id,
        image: item.images?.smallIcon ?? null,
      });
    }
  } catch {
    // Non-critical — names will fallback to templateId
  }
  return map;
}

/** Resolve account IDs → display names in batches of 100 */
async function resolveDisplayNames(
  accountIds: string[],
  accessToken: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(accountIds)];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const params = chunk.map(id => `accountId=${id}`).join('&');
    try {
      const { data } = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      for (const acc of Array.isArray(data) ? data : [data]) {
        if (acc.id && acc.displayName) map.set(acc.id, acc.displayName);
      }
    } catch {}
  }
  return map;
}

/** Parse gift data from common_core + athena profiles */
function parseGiftHistory(
  commonCoreItems: Record<string, any>,
  commonCoreStats: any,
  athenaItems: Record<string, any>,
  cosmeticMap: Map<string, { name: string; image: string | null }>,
  unknownItemLabel: string,
): { numReceived: number; senderMap: Map<string, GiftCosmetic[]> } {
  const giftHistory = commonCoreStats?.attributes?.gift_history;
  const numReceived = giftHistory?.num_received ?? 0;

  // Group athena items by giftFromAccountId
  const senderMap = new Map<string, GiftCosmetic[]>();

  for (const [, item] of Object.entries(athenaItems)) {
    const attrs = item.attributes || {};
    const senderId: string | undefined = attrs.giftFromAccountId;
    if (!senderId) continue;

    const tid: string = item.templateId || '';
    // Extract cosmetic ID from templateId like "AthenaCharacter:CID_xxx"
    const cosmeticId = tid.split(':')[1] ?? tid;
    const info = cosmeticMap.get(cosmeticId.toLowerCase());

    const cosmetic: GiftCosmetic = {
      templateId: tid,
      name: info?.name ?? (cosmeticId.replace(/_/g, ' ') || unknownItemLabel),
      imageUrl: info?.image ?? null,
      giftedDate: attrs.creation_time ?? null,
    };

    const arr = senderMap.get(senderId) ?? [];
    arr.push(cosmetic);
    senderMap.set(senderId, arr);
  }

  // Also check common_core gift boxes (GiftBox:*)
  for (const [, item] of Object.entries(commonCoreItems)) {
    const tid: string = item.templateId || '';
    if (!tid.toLowerCase().startsWith('giftbox:')) continue;

    const attrs = item.attributes || {};
    const senderId: string | undefined = attrs.fromAccountId;
    if (!senderId) continue;

    const lootList: any[] = attrs.lootList ?? [];
    for (const loot of lootList) {
      const lootTid: string = loot.itemType ?? '';
      const cosmeticId = lootTid.split(':')[1] ?? lootTid;
      const info = cosmeticMap.get(cosmeticId.toLowerCase());

      const cosmetic: GiftCosmetic = {
        templateId: lootTid,
        name: info?.name ?? (cosmeticId.replace(/_/g, ' ') || unknownItemLabel),
        imageUrl: info?.image ?? null,
        giftedDate: attrs.creation_time ?? null,
      };

      const arr = senderMap.get(senderId) ?? [];
      arr.push(cosmetic);
      senderMap.set(senderId, arr);
    }
  }

  return { numReceived, senderMap };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `<t:${Math.floor(d.getTime() / 1000)}:d>`;
}

// ── /gifts info handler ──────────────────────────────────────

async function handleGiftsInfo(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

  const emojis = {
    error: getEmoji(client, 'error'),
    success: getEmoji(client, 'success'),
    gift: getEmoji(client, 'gift'),
  };

  const { getUserLanguage } = await import('#helpers/locales/index.ts');
  const lang = await getUserLanguage(userId);

  const t = {
    title:         await translateForUser(userId, 'giftsInfo.title', undefined, locale),
    noGifts:       await translateForUser(userId, 'giftsInfo.noGifts', undefined, locale),
    totalReceived: await translateForUser(userId, 'giftsInfo.totalReceived', undefined, locale),
    senders:       await translateForUser(userId, 'giftsInfo.senders', undefined, locale),
    from:          await translateForUser(userId, 'giftsInfo.from', undefined, locale),
    items:         await translateForUser(userId, 'giftsInfo.items', undefined, locale),
    giftedOn:      await translateForUser(userId, 'giftsInfo.giftedOn', undefined, locale),
    lastGift:      await translateForUser(userId, 'giftsInfo.lastGift', undefined, locale),
    unknownItem:   await translateForUser(userId, 'giftsInfo.unknownItem', undefined, locale),
    unknownSender: await translateForUser(userId, 'giftsInfo.unknownSender', undefined, locale),
    selectSender:  await translateForUser(userId, 'giftsInfo.selectSender', undefined, locale),
    prev:          await translateForUser(userId, 'giftsInfo.prev', undefined, locale),
    next:          await translateForUser(userId, 'giftsInfo.next', undefined, locale),
    page:          await translateForUser(userId, 'giftsInfo.page', undefined, locale),
    fetchError:    await translateForUser(userId, 'giftsInfo.fetchError', undefined, locale),
    expired:       await translateForUser(userId, 'giftsInfo.expired', undefined, locale),
  };

  // ── Account ──
  const user = await UsuarioInfo.findOne({ id: userId });
  if (!user || !user.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }
  const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  const authorData = await getEpicAuthor(userId, {
    accountId: mainAccount.accountId,
    accessToken: mainAccount.accessToken,
    displayName: mainAccount.displayName,
  });
  const avatarUrl = authorData?.iconURL ?? interaction.user.displayAvatarURL();

  // ── Fetch profiles + cosmetic map ──
  let allSenders: GiftSender[];
  let numReceived: number;
  try {
    const [commonCoreResult, athenaResult, cosmeticMap] = await Promise.all([
      composeMCP({
        profile: 'common_core',
        operation: 'QueryProfile',
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      }),
      composeMCP({
        profile: 'athena',
        operation: 'QueryProfile',
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      }),
      fetchCosmeticMap(lang),
    ]);

    const ccData = commonCoreResult.data ?? commonCoreResult;
    const ccProfile = ccData?.profileChanges?.[0]?.profile ?? {};
    const ccItems = ccProfile.items ?? {};
    const ccStats = ccProfile.stats ?? {};

    const athData = athenaResult.data ?? athenaResult;
    const athItems = athData?.profileChanges?.[0]?.profile?.items ?? {};

    const parsed = parseGiftHistory(ccItems, ccStats, athItems, cosmeticMap, t.unknownItem);
    numReceived = parsed.numReceived;

    // Resolve display names
    const senderIds = [...parsed.senderMap.keys()];
    const nameMap = await resolveDisplayNames(senderIds, mainAccount.accessToken);

    // Build sender list sorted by most items
    allSenders = senderIds.map(id => {
      const cosmetics = parsed.senderMap.get(id)!;
      // Sort cosmetics by date descending
      cosmetics.sort((a, b) => {
        if (!a.giftedDate) return 1;
        if (!b.giftedDate) return -1;
        return new Date(b.giftedDate).getTime() - new Date(a.giftedDate).getTime();
      });
      const lastGiftDate = cosmetics[0]?.giftedDate ?? null;
      return {
        accountId: id,
        displayName: nameMap.get(id) ?? t.unknownSender,
        cosmetics,
        lastGiftDate,
      };
    });
    allSenders.sort((a, b) => b.cosmetics.length - a.cosmetics.length);
  } catch (err: any) {
    log.commands.error({ err }, '[gifts info] Failed to fetch gift data');
    const errContainer = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${emojis.error} ${t.title}\n-# ${err.message || t.fetchError}`
            )
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
      );
    await interaction.editReply({
      components: [errContainer.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
    return;
  }

  // ── Empty state ──
  if (allSenders.length === 0) {
    const emptyContainer = new ContainerBuilder()
      .setAccentColor(0xFEE75C)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${emojis.gift} ${t.title}\n-# ${mainAccount.displayName}`
            )
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.noGifts));
    await interaction.editReply({
      components: [emptyContainer.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
    return;
  }

  // ── State ──
  let activeSenderIdx = 0;
  let currentPage = 1;
  let senderMenuPage = 0;
  const SENDERS_PER_MENU = 25;

  function buildContainer(): ContainerBuilder {
    const sender = allSenders[activeSenderIdx];
    const totalPages = Math.max(1, Math.ceil(sender.cosmetics.length / ITEMS_PER_PAGE));
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = sender.cosmetics.slice(start, start + ITEMS_PER_PAGE);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${emojis.gift} ${t.title}\n` +
              `-# ${mainAccount!.displayName} · ${numReceived} ${t.totalReceived} · ${allSenders.length} ${t.senders}`
            )
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
      );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    // Sender header
    const pageText = totalPages > 1
      ? ` · ${t.page.replace('{page}', String(currentPage)).replace('{total}', String(totalPages))}`
      : '';
    const lastGiftText = sender.lastGiftDate ? ` · ${t.lastGift}: ${formatDate(sender.lastGiftDate)}` : '';
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${t.from}: **${sender.displayName}** (${sender.cosmetics.length} ${t.items})${pageText}${lastGiftText}`
      )
    );

    // Cosmetic items
    for (const cosmetic of pageItems) {
      const dateStr = cosmetic.giftedDate ? `${t.giftedOn}: ${formatDate(cosmetic.giftedDate)}` : '';
      let text = `**${cosmetic.name}**`;
      if (dateStr) text += `\n> ${dateStr}`;
      if (cosmetic.imageUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(cosmetic.imageUrl))
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
      }
    }

    // Pagination buttons
    if (totalPages > 1) {
      const navRow = new ActionRowBuilder<ButtonBuilder>();
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId('gifts_prev')
          .setLabel(t.prev)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage <= 1),
        new ButtonBuilder()
          .setCustomId('gifts_next')
          .setLabel(t.next)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage >= totalPages),
      );
      container.addActionRowComponents(navRow);
    }

    // Sender select menu
    if (allSenders.length > 1) {
      const totalMenuPages = Math.ceil(allSenders.length / SENDERS_PER_MENU);
      senderMenuPage = Math.max(0, Math.min(senderMenuPage, totalMenuPages - 1));
      const menuStart = senderMenuPage * SENDERS_PER_MENU;
      const menuEnd = Math.min(menuStart + SENDERS_PER_MENU, allSenders.length);

      // Arrow buttons for sender menu pages (gray)
      if (totalMenuPages > 1) {
        const menuNavRow = new ActionRowBuilder<ButtonBuilder>();
        menuNavRow.addComponents(
          new ButtonBuilder()
            .setCustomId('gifts_menu_prev')
            .setLabel('\u25C0')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(senderMenuPage <= 0),
          new ButtonBuilder()
            .setCustomId('gifts_menu_next')
            .setLabel('\u25B6')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(senderMenuPage >= totalMenuPages - 1),
        );
        container.addActionRowComponents(menuNavRow);
      }

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>();
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('gifts_sender')
        .setPlaceholder(t.selectSender);

      for (let i = menuStart; i < menuEnd; i++) {
        const s = allSenders[i];
        selectMenu.addOptions({
          label: `${s.displayName} (${s.cosmetics.length} ${t.items})`.substring(0, 100),
          value: String(i),
          default: i === activeSenderIdx,
        });
      }

      selectRow.addComponents(selectMenu);
      container.addActionRowComponents(selectRow);
    }

    return container;
  }

  await interaction.editReply({
    components: [buildContainer().toJSON() as any],
    flags: MessageFlags.IsComponentsV2,
  } as any);

  // ── Collector ──
  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    idle: EPIC_PAGINATION_IDLE_MS,
  });

  collector.on('collect', async (btn) => {
    const cid = btn.customId;
    await btn.deferUpdate();

    if (cid === 'gifts_sender' && btn.isStringSelectMenu()) {
      activeSenderIdx = parseInt(btn.values[0], 10) || 0;
      currentPage = 1;
      senderMenuPage = Math.floor(activeSenderIdx / SENDERS_PER_MENU);
    } else if (cid === 'gifts_prev') {
      currentPage--;
    } else if (cid === 'gifts_next') {
      currentPage++;
    } else if (cid === 'gifts_menu_prev') {
      senderMenuPage--;
    } else if (cid === 'gifts_menu_next') {
      senderMenuPage++;
    } else {
      return;
    }

    try {
      await interaction.editReply({
        components: [buildContainer().toJSON() as any],
        flags: MessageFlags.IsComponentsV2,
      } as any);
    } catch {}
  });

  collector.on('end', async (_, reason) => {
    if (isCollectorIdle(reason)) {
      try {
        const inactiveText = await translateForUser(userId, 'epic.inactivePagination', undefined, interaction.locale);
        await editReplyInactive(interaction, inactiveText);
      } catch {}
    }
  });
}

// ── /gifts enable | disable handler ──────────────────────────

async function handleBulkGiftsToggle(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  enableGifts: boolean,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const successKey = enableGifts ? 'receiveGifts.embed.enabled' : 'receiveGifts.embed.disabled';
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        await composeMCP({
          profile: 'common_core',
          operation: 'SetReceiveGiftsEnabled',
          accountId: account.accountId,
          accessToken: account.accessToken,
          body: { bReceiveGifts: enableGifts },
        });
        return { account, ok: true as const };
      } catch {
        return { account, ok: false as const };
      }
    }),
  );

  const fields: BulkEmbedField[] = [];
  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authError' in v && v.authError) {
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.account.displayName, v.account.cuentaMain);
    if (v.ok) {
      const msg = await translateEpic(client, userId, successKey, enableGifts ? 'success' : 'info', undefined, locale);
      fields.push({ name: label, value: msg, inline: true });
    } else {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', failedLabel), inline: true });
    }
  }

  const title = await translateForUser(userId, 'receiveGifts.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summaryKey = enableGifts ? 'receiveGifts.bulk.summaryEnable' : 'receiveGifts.bulk.summaryDisable';
  const summary = await translateForUser(userId, summaryKey, undefined, locale);
  await sendBulkPaginated(interaction, title, summary, fields, enableGifts ? 'success' : 'info');
}

async function handleGiftsToggle(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const subcommand = interaction.options.getSubcommand();
  const enableGifts = subcommand === 'enable';
  const bulk = interaction.options.getBoolean('bulk') ?? false;

  if (bulk) {
    if (!await guardBulkMode(interaction)) return;
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    return handleBulkGiftsToggle(interaction, user, enableGifts);
  }

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    log.epic.info(`${enableGifts ? 'Enabling' : 'Disabling'} gifts for ${mainAccount.displayName}`);

    await composeMCP({
      profile: 'common_core',
      operation: 'SetReceiveGiftsEnabled',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      body: { bReceiveGifts: enableGifts },
    });

    log.epic.info(`Gifts ${enableGifts ? 'enabled' : 'disabled'} successfully`);

    const key = enableGifts ? 'receiveGifts.embed.enabled' : 'receiveGifts.embed.disabled';
    await replyWithEpicEmbed(interaction, userId, {
      style: enableGifts ? 'success' : 'info',
      description: await translateEpic(client, userId, key, enableGifts ? 'success' : 'info', undefined, locale),
      author: authorData,
      footerKey: 'brand',
    });
  } catch (error: unknown) {
    log.epic.error({ error }, 'Error changing gift settings');
    await replyEpicCustomError(interaction, userId, 'epic.errors.unexpected');
  }
}

// ── Command definition ───────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gifts')
    .setDescription('Manage gifts on your account')
    .setNameLocalizations(buildDiscordLocalizations('gifts.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('gifts.cmd.description'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      addBulkOption(
        sub
          .setName('enable')
          .setDescription('Enable receiving gifts on your account')
          .setNameLocalizations(buildDiscordLocalizations('gifts.cmd.subcommands.enable.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('gifts.cmd.subcommands.enable.description')),
        'receiveGifts.bulk.optionDescriptionEnable',
      ),
    )
    .addSubcommand((sub) =>
      addBulkOption(
        sub
          .setName('disable')
          .setDescription('Disable receiving gifts on your account')
          .setNameLocalizations(buildDiscordLocalizations('gifts.cmd.subcommands.disable.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('gifts.cmd.subcommands.disable.description')),
        'receiveGifts.bulk.optionDescriptionDisable',
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('View your gift history')
        .setNameLocalizations(buildDiscordLocalizations('gifts.cmd.subcommands.info.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('gifts.cmd.subcommands.info.description')),
    ) as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'info') {
      return handleGiftsInfo(interaction);
    }
    return handleGiftsToggle(interaction);
  },
};

export default command;
