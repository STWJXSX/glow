/**
 * AutoBuy BR — interactive watchlist panel (/autobuy br).
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  Message,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  getEpicAuthor,
  replyEpicCredentialError,
  type EpicEmbedInput,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { editReplyInactive, EPIC_PANEL_IDLE_MS } from '#helpers/commands/epic/epicCollectorHelper.ts';
import { getEmojiButtonComponent } from '#helpers/core/emojis.ts';
import {
  addToWatchlist,
  getAllBrCosmetics,
  getWatchlistAccountState,
  removeFromWatchlist,
  searchCosmetics,
  resolveMainAccount,
  type BrCosmetic,
} from './brData.ts';

const ITEMS_PER_PAGE = 8;
const NEAR_LIMIT = 40;
const EPHEMERAL_TTL_MS = 15_000;

const IDS = {
  navFirst: 'autobuy_br:nav:first',
  navPrev: 'autobuy_br:nav:prev',
  navNext: 'autobuy_br:nav:next',
  navLast: 'autobuy_br:nav:last',
  remove: 'autobuy_br:remove',
  removeBtn: 'autobuy_br:remove_btn',
  add: 'autobuy_br:add',
  modal: 'autobuy_br:modal',
  pick: 'autobuy_br:pick',
} as const;

type EphemeralSource = {
  followUp: (options: object) => Promise<Message<boolean>>;
  locale?: string | null;
};

function createEphemeralToast(userId: string, interaction: ChatInputCommandInteraction) {
  let message: Message | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleDelete = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      message?.delete().catch(() => {});
      message = null;
    }, EPHEMERAL_TTL_MS);
  };

  return async function showToast(
    source: EphemeralSource,
    input: EpicEmbedInput,
    components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [],
  ): Promise<Message | null> {
    const embed = await buildEpicEmbed(
      userId,
      input,
      interaction,
      source.locale ?? interaction.locale,
    );
    const body = { embeds: [embed], components };

    if (message) {
      await message.edit(body);
    } else {
      message = await source.followUp({ ...body, ephemeral: true, fetchReply: true });
    }

    scheduleDelete();
    return message;
  };
}

function navButton(
  customId: string,
  emojiKey: 'page_first' | 'page_prev' | 'page_next' | 'page_last',
  disabled: boolean,
): ButtonBuilder {
  const btn = new ButtonBuilder().setCustomId(customId).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  const emoji = getEmojiButtonComponent(emojiKey);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

function formatItemLine(cosmetic: BrCosmetic | undefined, id: string): string {
  if (cosmetic) return `**${cosmetic.name}** (${cosmetic.type}) · \`${id}\``;
  return `\`${id}\``;
}

async function buildBrPanel(
  interaction: ChatInputCommandInteraction,
  page: number,
  watchedIds: string[],
  cosmeticMap: Map<string, BrCosmetic>,
  opts: { removeMode: boolean; isActive: boolean },
) {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const author = await getEpicAuthor(userId);

  const total = watchedIds.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = watchedIds.slice(safePage * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE + ITEMS_PER_PAGE);

  let description: string;
  if (total === 0) {
    description = epicEmojiLine(
      client,
      'inactive',
      await translateForUser(userId, 'autobuy_cmd.panel.br.empty', undefined, locale),
    );
  } else {
    const statusKey = opts.isActive ? 'autobuy_cmd.list.active' : 'autobuy_cmd.list.inactive';
    const statusEmoji = opts.isActive ? 'active' : 'inactive';
    const statusLine = epicEmojiLine(
      client,
      statusEmoji,
      await translateForUser(userId, statusKey, undefined, locale),
    );
    const lines = slice.map((id) => epicQuote(formatItemLine(cosmeticMap.get(id), id)));
    description = [statusLine, '', ...lines].join('\n');
  }

  const showFooter = totalPages > 1 || total >= NEAR_LIMIT;
  const footerText = showFooter
    ? await translateForUser(userId, 'autobuy_cmd.panel.br.footer', {
        count: String(total),
        page: String(safePage + 1),
        total: String(totalPages),
      }, locale)
    : undefined;

  const payload = await buildEpicReplyPayload(
    userId,
    { style: 'info', description, author, footerText, footerKey: footerText ? undefined : 'brand' },
    interaction,
    locale,
  );

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        navButton(IDS.navFirst, 'page_first', safePage === 0),
        navButton(IDS.navPrev, 'page_prev', safePage === 0),
        navButton(IDS.navNext, 'page_next', safePage >= totalPages - 1),
        navButton(IDS.navLast, 'page_last', safePage >= totalPages - 1),
      ),
    );
  }

  if (opts.removeMode && total > 0) {
    const removeOptions = watchedIds.slice(0, 25).map((id) => {
      const info = cosmeticMap.get(id);
      const label = info ? `${info.name} (${info.type})` : id;
      return new StringSelectMenuOptionBuilder()
        .setLabel(label.length > 100 ? label.slice(0, 100) : label)
        .setValue(id)
        .setDescription(id.slice(0, 100));
    });

    const removeMenu = new StringSelectMenuBuilder()
      .setCustomId(IDS.remove)
      .setPlaceholder(await translateForUser(userId, 'autobuy_cmd.panel.br.removePlaceholder', undefined, locale))
      .addOptions(removeOptions);

    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeMenu));
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  if (total > 0) {
    const removeBtn = new ButtonBuilder()
      .setCustomId(IDS.removeBtn)
      .setLabel(await translateForUser(userId, 'autobuy_cmd.panel.br.removeButton', undefined, locale))
      .setStyle(ButtonStyle.Danger);
    const deleteEmoji = getEmojiButtonComponent('delete');
    if (deleteEmoji) removeBtn.setEmoji(deleteEmoji);
    actionRow.addComponents(removeBtn);
  }

  const addBtn = new ButtonBuilder()
    .setCustomId(IDS.add)
    .setLabel(await translateForUser(userId, 'autobuy_cmd.panel.br.addButton', undefined, locale))
    .setStyle(ButtonStyle.Success);
  const addEmoji = getEmojiButtonComponent('add');
  if (addEmoji) addBtn.setEmoji(addEmoji);
  actionRow.addComponents(addBtn);

  components.push(actionRow);

  return { payload, components, page: safePage, totalPages };
}

async function refreshPanel(
  interaction: ChatInputCommandInteraction,
  page: number,
  accountId: string,
  apiLang: string,
  removeMode: boolean,
) {
  const { watchedCosmeticIds, isActive } = await getWatchlistAccountState(interaction.user.id, accountId);
  const cosmetics = await getAllBrCosmetics(apiLang);
  const cosmeticMap = new Map(cosmetics.map((c) => [c.id, c]));
  const { payload, components } = await buildBrPanel(
    interaction,
    page,
    watchedCosmeticIds,
    cosmeticMap,
    { removeMode, isActive },
  );
  await interaction.editReply({ ...payload, components });
  return { watchedCosmeticIds, cosmeticMap, page, isActive };
}

export async function handleAutoBuyBrPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const showToast = createEphemeralToast(userId, interaction);

  const resolved = await resolveMainAccount(userId);
  if (!resolved.ok) {
    await replyEpicCredentialError(interaction, userId, resolved.reason);
    return;
  }

  const { accountId } = resolved;
  const apiLang = await getFortniteApiLanguageCode(userId, locale);
  let page = 0;
  let removeMode = false;

  const initial = await refreshPanel(interaction, page, accountId, apiLang, removeMode);
  page = initial.page;

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (componentInteraction) => {
    if (componentInteraction.customId === IDS.removeBtn && componentInteraction.isButton()) {
      await componentInteraction.deferUpdate();
      removeMode = !removeMode;
      const refreshed = await refreshPanel(interaction, page, accountId, apiLang, removeMode);
      page = refreshed.page;
      return;
    }

    if (componentInteraction.customId === IDS.add) {
      const modal = new ModalBuilder()
        .setCustomId(IDS.modal)
        .setTitle(await translateForUser(userId, 'autobuy_cmd.panel.br.modalTitle', undefined, locale));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel(await translateForUser(userId, 'autobuy_cmd.panel.br.modalLabel', undefined, locale))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
      );

      await componentInteraction.showModal(modal);

      try {
        const modalSubmit = await componentInteraction.awaitModalSubmit({
          filter: (i) => i.customId === IDS.modal && i.user.id === userId,
          time: EPIC_PANEL_IDLE_MS,
        });
        await modalSubmit.deferUpdate();

        const query = modalSubmit.fields.getTextInputValue('query');
        const cosmetics = await getAllBrCosmetics(apiLang);
        const search = searchCosmetics(cosmetics, query);

        if (search.kind === 'none') {
          await showToast(modalSubmit, {
            style: 'error',
            description: await translateForUser(userId, 'autobuy_cmd.panel.br.notFound', { query }, locale),
            footerKey: 'brand',
          });
          return;
        }

        let selected = search.kind === 'single' ? search.cosmetic : null;

        if (search.kind === 'multiple') {
          const pickOptions = search.matches.map((c) => {
            const label = `${c.name} (${c.type})`;
            return new StringSelectMenuOptionBuilder()
              .setLabel(label.length > 100 ? label.slice(0, 100) : label)
              .setValue(c.id)
              .setDescription(c.id.slice(0, 100));
          });

          const pickMenu = new StringSelectMenuBuilder()
            .setCustomId(IDS.pick)
            .setPlaceholder(await translateForUser(userId, 'autobuy_cmd.panel.br.pickPlaceholder', undefined, locale))
            .addOptions(pickOptions);

          const pickRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pickMenu);
          const matchesText = await translateForUser(
            userId,
            'autobuy_cmd.panel.br.matches',
            { query, count: String(search.matches.length) },
            locale,
          );

          const pickReply = await showToast(modalSubmit, {
            style: 'info',
            description: matchesText,
            footerKey: 'brand',
          }, [pickRow]);

          if (!pickReply) return;

          try {
            const pickInteraction = await pickReply.awaitMessageComponent({
              componentType: ComponentType.StringSelect,
              filter: (i) => i.user.id === userId && i.customId === IDS.pick,
              time: EPIC_PANEL_IDLE_MS,
            });
            await pickInteraction.deferUpdate();
            const cosmeticId = pickInteraction.values[0];
            selected = search.matches.find((c) => c.id === cosmeticId)
              ?? cosmetics.find((c) => c.id === cosmeticId)
              ?? null;

            if (!selected) {
              await showToast(pickInteraction, {
                style: 'error',
                description: await translateForUser(userId, 'autobuy_cmd.errors.generic', undefined, locale),
                footerKey: 'brand',
              });
              return;
            }
          } catch {
            return;
          }
        }

        if (!selected) return;

        const result = await addToWatchlist(userId, accountId, selected.id, selected);
        if (!result.ok) {
          const key = result.reason === 'already'
            ? 'autobuy_cmd.errors.alreadyWatched'
            : result.reason === 'full'
              ? 'autobuy_cmd.errors.watchlistFull'
              : 'autobuy_cmd.errors.generic';
          const msg = result.reason === 'already'
            ? await translateForUser(userId, key, { item: result.displayName ?? selected.name }, locale)
            : await translateForUser(userId, key, undefined, locale);
          await showToast(modalSubmit, {
            style: 'error',
            description: msg,
            footerKey: 'brand',
          });
          return;
        }

        removeMode = false;
        page = (await refreshPanel(interaction, page, accountId, apiLang, removeMode)).page;
        await showToast(modalSubmit, {
          style: 'success',
          description: await translateForUser(userId, 'autobuy_cmd.panel.br.added', { item: result.displayName }, locale),
          footerKey: 'brand',
        });
      } catch {
        // Modal timeout
      }
      return;
    }

    if (componentInteraction.customId === IDS.remove && componentInteraction.isStringSelectMenu()) {
      await componentInteraction.deferUpdate();
      const cosmeticId = componentInteraction.values[0];
      const cosmetics = await getAllBrCosmetics(apiLang);
      const cosmetic = cosmetics.find((c) => c.id === cosmeticId);
      const result = await removeFromWatchlist(userId, accountId, cosmeticId, cosmetic);

      if (!result.ok) {
        await showToast(componentInteraction, {
          style: 'error',
          description: await translateForUser(userId, 'autobuy_cmd.errors.notInWatchlist', undefined, locale),
          footerKey: 'brand',
        });
        return;
      }

      removeMode = false;
      const refreshed = await refreshPanel(interaction, page, accountId, apiLang, removeMode);
      page = refreshed.page;
      await showToast(componentInteraction, {
        style: 'success',
        description: await translateForUser(userId, 'autobuy_cmd.panel.br.removed', { item: result.displayName }, locale),
        footerKey: 'brand',
      });
      return;
    }

    if (componentInteraction.isButton()) {
      const { watchedCosmeticIds } = await getWatchlistAccountState(userId, accountId);
      const totalPages = Math.max(1, Math.ceil(watchedCosmeticIds.length / ITEMS_PER_PAGE));

      if (componentInteraction.customId === IDS.navFirst) page = 0;
      else if (componentInteraction.customId === IDS.navPrev) page = Math.max(0, page - 1);
      else if (componentInteraction.customId === IDS.navNext) page = Math.min(totalPages - 1, page + 1);
      else if (componentInteraction.customId === IDS.navLast) page = totalPages - 1;
      else return;

      await componentInteraction.deferUpdate();
      const refreshed = await refreshPanel(interaction, page, accountId, apiLang, removeMode);
      page = refreshed.page;
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (reason !== 'idle') return;
    const inactive = await translateForUser(userId, 'epic.inactiveConfirm', undefined, locale);
    await editReplyInactive(interaction, inactive).catch(() => {});
  });
}
