/**
 * AutoBuy STW — interactive config panel (/autobuy stw).
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  followUpWithEpicEmbed,
  getEpicAuthor,
  replyEpicCredentialError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { editReplyInactive, EPIC_PANEL_IDLE_MS } from '#helpers/commands/epic/epicCollectorHelper.ts';
import { getAppEmojiByName } from '#helpers/core/emojis.ts';
import AutoBuySTW from '#models/AutoBuySTW.ts';
import { log } from '#helpers/core/logger.ts';
import { resolveMainAccount } from './brData.ts';
import {
  ALL_BUYABLE_KEYS,
  getItemDisplayName,
  ITEM_EMOJI_MAP,
} from '#helpers/epic/stw/stwBuyableItems.ts';

const IDS = {
  select: 'autobuy_stw:select',
  clean: 'autobuy_stw:clean',
} as const;

function resolveOptionEmojiId(client: ChatInputCommandInteraction['client'], emojiName: string): string | undefined {
  const cache = (client.application as any)?.emojis?.cache;
  if (!cache) return undefined;
  for (const emoji of cache.values()) {
    if (emoji.name === emojiName) return emoji.id;
  }
  return undefined;
}

async function saveStwSelection(
  discordId: string,
  accountId: string,
  selectedItems: string[],
): Promise<void> {
  let doc = await AutoBuySTW.findOne({ discordId });
  if (!doc) {
    doc = new AutoBuySTW({ discordId, accounts: new Map() });
  }

  const existing = doc.accounts.get(accountId);
  doc.accounts.set(accountId, {
    isActive: selectedItems.length > 0,
    accountId,
    selectedItems,
    createdAt: existing?.createdAt ?? new Date(),
    lastActivity: new Date(),
    lastPurchaseCount: existing?.lastPurchaseCount ?? 0,
    lastGoldSpent: existing?.lastGoldSpent ?? 0,
  });

  doc.markModified('accounts');
  await doc.save();

  log.commands.info({ discordId, accountId, items: selectedItems }, '[AUTOBUY-STW] Configuration saved');
}

async function getSelectedItems(discordId: string, accountId: string): Promise<string[]> {
  const doc = await AutoBuySTW.findOne({ discordId });
  const accountData = doc?.accounts?.get(accountId);
  if (!accountData?.isActive || !accountData.selectedItems?.length) return [];
  return accountData.selectedItems;
}

async function buildStwPanel(
  interaction: ChatInputCommandInteraction,
  selectedItems: string[],
) {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const lang = await getUserLanguage(userId, locale);
  const author = await getEpicAuthor(userId);

  let description: string;
  if (selectedItems.length === 0) {
    description = epicEmojiLine(
      client,
      'inactive',
      await translateForUser(userId, 'autobuy_cmd.panel.stw.empty', undefined, locale),
    );
  } else {
    const lines: string[] = [];
    for (const key of selectedItems) {
      const label = getItemDisplayName(key, lang);
      const emojiName = ITEM_EMOJI_MAP[key];
      const emoji = emojiName ? getAppEmojiByName(client, emojiName) : '';
      lines.push(epicQuote(`${emoji} ${label}`.trim()));
    }
    description = lines.join('\n');
  }

  const payload = await buildEpicReplyPayload(
    userId,
    { style: 'info', description, author, footerKey: 'brand' },
    interaction,
    locale,
  );

  const options = await Promise.all(
    ALL_BUYABLE_KEYS.map(async (key) => {
      const label = getItemDisplayName(key, lang);
      const emojiName = ITEM_EMOJI_MAP[key];
      const emojiId = emojiName ? resolveOptionEmojiId(client, emojiName) : undefined;

      const opt = new StringSelectMenuOptionBuilder()
        .setLabel(label.length > 100 ? label.slice(0, 100) : label)
        .setValue(key);

      if (emojiId) opt.setEmoji({ id: emojiId });
      if (selectedItems.includes(key)) opt.setDefault(true);
      return opt;
    }),
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.select)
    .setPlaceholder(await translateForUser(userId, 'autobuy_cmd.panel.stw.selectPlaceholder', undefined, locale))
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);

  const cleanBtn = new ButtonBuilder()
    .setCustomId(IDS.clean)
    .setLabel(await translateForUser(userId, 'autobuy_cmd.panel.stw.cleanButton', undefined, locale))
    .setStyle(ButtonStyle.Danger)
    .setDisabled(selectedItems.length === 0);

  const components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(cleanBtn),
  ];

  return { payload, components };
}

async function refreshStwPanel(
  interaction: ChatInputCommandInteraction,
  accountId: string,
) {
  const selectedItems = await getSelectedItems(interaction.user.id, accountId);
  const { payload, components } = await buildStwPanel(interaction, selectedItems);
  await interaction.editReply({ ...payload, components });
  return selectedItems;
}

export async function handleAutoBuyStwPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;

  const resolved = await resolveMainAccount(userId);
  if (!resolved.ok) {
    await replyEpicCredentialError(interaction, userId, resolved.reason);
    return;
  }

  const { accountId } = resolved;
  await refreshStwPanel(interaction, accountId);

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (componentInteraction) => {
    if (componentInteraction.customId === IDS.select && componentInteraction.isStringSelectMenu()) {
      await componentInteraction.deferUpdate();
      const selected = componentInteraction.values;
      await saveStwSelection(userId, accountId, selected);
      await refreshStwPanel(interaction, accountId);

      const msg = selected.length > 0
        ? await translateForUser(userId, 'autobuy_cmd.panel.stw.saved', { count: String(selected.length) }, locale)
        : await translateForUser(userId, 'autobuy_cmd.panel.stw.cleared', undefined, locale);

      await followUpWithEpicEmbed(componentInteraction, userId, {
        style: 'success',
        description: msg,
        footerKey: 'brand',
      });
      return;
    }

    if (componentInteraction.customId === IDS.clean && componentInteraction.isButton()) {
      await componentInteraction.deferUpdate();
      await saveStwSelection(userId, accountId, []);
      await refreshStwPanel(interaction, accountId);

      await followUpWithEpicEmbed(componentInteraction, userId, {
        style: 'success',
        description: await translateForUser(userId, 'autobuy_cmd.panel.stw.cleared', undefined, locale),
        footerKey: 'brand',
      });
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (reason !== 'idle') return;
    const inactive = await translateForUser(userId, 'epic.inactiveConfirm', undefined, locale);
    await editReplyInactive(interaction, inactive).catch(() => {});
  });
}
