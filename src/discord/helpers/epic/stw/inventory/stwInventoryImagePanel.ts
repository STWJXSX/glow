import {
  ChatInputCommandInteraction,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import {
  buildClassicEmbedEditPayload,
  createInfoEmbed,
  createWarningEmbed,
  createErrorEmbed,
  type EmbedStyle,
  type LockerV2ActionRow,
} from '#helpers/core/embedHelper.ts';
import {
  fetchStwInventoryItems,
  type StwInventorySource,
} from './stwInventoryData.ts';
import {
  buildInventoryFilterHint,
  filterInventoryItems,
  hasActiveInventoryFilters,
  INVENTORY_CATEGORY_CHOICES,
  INVENTORY_RARITY_CHOICES,
  INVENTORY_SOURCE_CHOICES,
  labelInventoryCategory,
  labelInventoryRarity,
  labelInventorySource,
  type StwInventoryCategoryMenuValue,
  type StwInventoryFilterState,
  type StwInventoryRarityMenuValue,
} from './stwInventoryFilters.ts';
import {
  generateStwInventoryPanelResult,
} from '#managers/images/stw/index.ts';
import {
  COLLECTION_PANEL_TIMEOUT_MS,
  applyMultiSelectState,
  formatMultiSelectLabels,
} from '../collection/stwCollectionImagePanel.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';

async function createBackButton(userId: string, locale?: string | null, disabled = false): Promise<ButtonBuilder> {
  return new ButtonBuilder()
    .setCustomId('stw_inv_back')
    .setLabel(await translateForUser(userId, 'stwInventoryImage.panel.back', undefined, locale))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

async function buildInventoryPanelPayload(
  state: StwInventoryFilterState,
  lang: 'en' | 'es',
  accountTotal: number,
  filteredCount: number,
  authorData: Awaited<ReturnType<typeof getMainAccountAuthor>>,
  userId: string,
  locale?: string | null,
  style: EmbedStyle = 'info',
  extraLine?: string,
) {
  const title = await translateForUser(userId, 'stwInventoryImage.panel.title', undefined, locale);
  let description = `**${title}**\n\n${await buildPanelContent(state, lang, accountTotal, filteredCount, userId, locale)}`;
  if (extraLine) description += `\n\n${extraLine}`;

  const embed =
    style === 'warning'
      ? await createWarningEmbed({ description, author: authorData ?? undefined })
      : await createInfoEmbed({ description, author: authorData ?? undefined });

  return buildClassicEmbedEditPayload({
    embeds: [embed],
    components: await createInventoryActionRows(state, lang, userId, locale),
  });
}

/** Gallery on the same message (classic embed only — V2 flag cannot be removed once set). */
async function editInventoryGalleryReply(
  interaction: ChatInputCommandInteraction,
  hint: string,
  attachments: AttachmentBuilder[],
  authorData: Awaited<ReturnType<typeof getMainAccountAuthor>>,
  userId: string,
  locale?: string | null,
): Promise<void> {
  const embeds: EmbedBuilder[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const file = attachments[i]!;
    const fileName = file.name ?? `stw-inventory-${i + 1}.webp`;
    embeds.push(
      await createInfoEmbed({
        description: i === 0 ? hint : '\u200b',
        image: `attachment://${fileName}`,
        author: i === 0 ? (authorData ?? undefined) : undefined,
      }),
    );
  }

  if (!embeds.length) {
    embeds.push(await createInfoEmbed({ description: hint, author: authorData ?? undefined }));
  }

  await interaction.editReply(
    buildClassicEmbedEditPayload({
      embeds,
      files: attachments,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(await createBackButton(userId, locale)),
      ],
    }) as any,
  );
}

function buildSourceOptions(lang: 'en' | 'es') {
  return INVENTORY_SOURCE_CHOICES.map((c) => ({
    value: c.value,
    label: lang === 'es' ? c.es : c.en,
  }));
}

function buildCategoryOptions(lang: 'en' | 'es') {
  return [
    { value: 'all' as const, label: labelInventoryCategory('all', lang) },
    ...INVENTORY_CATEGORY_CHOICES.map((c) => ({
      value: c.value as StwInventoryCategoryMenuValue,
      label: lang === 'es' ? c.es : c.en,
    })),
  ];
}

function buildRarityOptions(lang: 'en' | 'es') {
  return [
    { value: 'all' as const, label: labelInventoryRarity('all', lang) },
    ...INVENTORY_RARITY_CHOICES.map((c) => ({
      value: c.value as StwInventoryRarityMenuValue,
      label: lang === 'es' ? c.es : c.en,
    })),
  ];
}

async function buildPanelContent(
  state: StwInventoryFilterState,
  lang: 'en' | 'es',
  accountTotal: number,
  filteredCount: number,
  userId: string,
  locale?: string | null,
): Promise<string> {
  const sourceLabel = labelInventorySource(state.source, lang);
  const catOptions = buildCategoryOptions(lang);
  const rarOptions = buildRarityOptions(lang);
  const catLabel = await formatMultiSelectLabels(
    state.categories as string[],
    catOptions,
    labelInventoryCategory('all', lang),
    userId,
    locale,
  );
  const rarLabel = await formatMultiSelectLabels(
    state.rarities as string[],
    rarOptions,
    labelInventoryRarity('all', lang),
    userId,
    locale,
  );
  const itemWord = await translateForUser(userId, 'stwInventoryImage.panel.item', undefined, locale);

  const instructions = await translateForUser(userId, 'stwInventoryImage.panel.instructions', undefined, locale);
  const sourceLine = await translateForUser(
    userId,
    'stwInventoryImage.panel.sourceLine',
    { source: sourceLabel },
    locale,
  );
  const categoriesLine = await translateForUser(
    userId,
    'stwInventoryImage.panel.categoriesLine',
    { categories: catLabel },
    locale,
  );
  const raritiesLine = await translateForUser(
    userId,
    'stwInventoryImage.panel.raritiesLine',
    { rarities: rarLabel },
    locale,
  );
  const inAccountKey = hasActiveInventoryFilters(state)
    ? 'stwInventoryImage.panel.inAccountLineFiltered'
    : 'stwInventoryImage.panel.inAccountLine';
  const inAccountLine = await translateForUser(
    userId,
    inAccountKey,
    hasActiveInventoryFilters(state)
      ? { total: String(accountTotal), filtered: String(filteredCount), item: itemWord }
      : { count: String(accountTotal), item: itemWord },
    locale,
  );

  return `${instructions}\n\n${sourceLine}\n${categoriesLine}\n${raritiesLine}\n${inAccountLine}`;
}

async function createInventoryActionRows(
  state: StwInventoryFilterState,
  lang: 'en' | 'es',
  userId: string,
  locale?: string | null,
  disabled = false,
): Promise<LockerV2ActionRow[]> {
  const sourceOptions = buildSourceOptions(lang);
  const catOptions = buildCategoryOptions(lang);
  const rarOptions = buildRarityOptions(lang);

  const sourceSelect = new StringSelectMenuBuilder()
    .setCustomId('stw_inv_source')
    .setPlaceholder(await translateForUser(userId, 'stwInventoryImage.panel.sourcePlaceholder', undefined, locale))
    .setDisabled(disabled)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      sourceOptions.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label.slice(0, 100))
          .setValue(opt.value)
          .setDefault(state.source === opt.value),
      ),
    );

  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId('stw_inv_category')
    .setPlaceholder(await translateForUser(userId, 'stwInventoryImage.panel.categoriesPlaceholder', undefined, locale))
    .setDisabled(disabled)
    .setMinValues(1)
    .setMaxValues(catOptions.length)
    .addOptions(
      catOptions.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label.slice(0, 100))
          .setValue(opt.value)
          .setDefault(state.categories.includes(opt.value)),
      ),
    );

  const raritySelect = new StringSelectMenuBuilder()
    .setCustomId('stw_inv_rarity')
    .setPlaceholder(await translateForUser(userId, 'stwInventoryImage.panel.raritiesPlaceholder', undefined, locale))
    .setDisabled(disabled)
    .setMinValues(1)
    .setMaxValues(rarOptions.length)
    .addOptions(
      rarOptions.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label.slice(0, 100))
          .setValue(opt.value)
          .setDefault(state.rarities.includes(opt.value)),
      ),
    );

  const generateButton = new ButtonBuilder()
    .setCustomId('stw_inv_generate')
    .setLabel(await translateForUser(userId, 'stwInventoryImage.panel.generateButton', undefined, locale))
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sourceSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(raritySelect),
    new ActionRowBuilder<ButtonBuilder>().addComponents(generateButton),
  ];
}

async function restoreInventoryPanel(
  interaction: ChatInputCommandInteraction,
  state: StwInventoryFilterState,
  lang: 'en' | 'es',
  accountTotal: number,
  filteredCount: number,
  authorData: Awaited<ReturnType<typeof getMainAccountAuthor>>,
  userId: string,
  locale?: string | null,
): Promise<void> {
  await interaction.editReply(
    (await buildInventoryPanelPayload(
      state,
      lang,
      accountTotal,
      filteredCount,
      authorData,
      userId,
      locale,
    )) as any,
  );
}

export async function runStwInventoryImagePanel(
  interaction: ChatInputCommandInteraction,
  defaultSource: StwInventorySource,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const userLanguage = await getUserLanguage(userId, locale);
  const lang = userLanguage === 'es' ? 'es' : 'en';

  let state: StwInventoryFilterState = {
    source: defaultSource,
    categories: ['all'],
    rarities: ['all'],
  };

  let cachedBySource = new Map<StwInventorySource, Awaited<ReturnType<typeof fetchStwInventoryItems>>>();
  let showingGallery = false;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) {
      const embed = await createErrorEmbed({
        description:
          (await translateForUser(userId, 'buy.errors.shopDataUnavailable')) || 'No account found.',
        interaction,
      });
      await interaction.editReply(buildClassicEmbedEditPayload({ embeds: [embed], components: [] }) as any);
      return;
    }

    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
    if (!mainAccount) {
      const embed = await createErrorEmbed({
        description:
          (await translateForUser(userId, 'buy.errors.shopDataUnavailable')) || 'No main account.',
        interaction,
      });
      await interaction.editReply(buildClassicEmbedEditPayload({ embeds: [embed], components: [] }) as any);
      return;
    }

    const account = mainAccount;

    const authorData = await getMainAccountAuthor(userId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName || mainAccount.displayName || 'Account',
    });

    const loadSource = async (source: StwInventorySource) => {
      if (!cachedBySource.has(source)) {
        const items = await fetchStwInventoryItems(
          account.accountId,
          account.accessToken,
          source,
          userLanguage as SupportedLanguage,
        );
        cachedBySource.set(source, items);
      }
      return cachedBySource.get(source)!;
    };

    const getCounts = async () => {
      const items = await loadSource(state.source);
      return {
        total: items.length,
        filtered: filterInventoryItems(items, state).length,
      };
    };

    const initialCounts = await getCounts();

    const panelMessage = await interaction.editReply(
      (await buildInventoryPanelPayload(
        state,
        lang,
        initialCounts.total,
        initialCounts.filtered,
        authorData,
        userId,
        locale,
      )) as any,
    );

    const collector = panelMessage.createMessageComponentCollector({
      idle: COLLECTION_PANEL_TIMEOUT_MS,
    });

    collector.on('collect', async (componentInteraction) => {
      if (componentInteraction.user.id !== userId) {
        await componentInteraction.reply({
          content: await translateForUser(userId, 'stwInventoryImage.panel.onlyAuthor', undefined, locale),
          ephemeral: true,
        });
        return;
      }

      if (componentInteraction.customId === 'stw_inv_back') {
        if (!componentInteraction.isButton()) return;
        await componentInteraction.deferUpdate();
        showingGallery = false;
        const counts = await getCounts();
        await restoreInventoryPanel(
          interaction,
          state,
          lang,
          counts.total,
          counts.filtered,
          authorData,
          userId,
          locale,
        );
        return;
      }

      if (showingGallery) return;

      if (componentInteraction.isStringSelectMenu()) {
        const select = componentInteraction as StringSelectMenuInteraction;
        if (select.customId === 'stw_inv_source') {
          state.source = (select.values[0] ?? defaultSource) as StwInventorySource;
        } else if (select.customId === 'stw_inv_category') {
          state.categories = applyMultiSelectState(
            state.categories as string[],
            select.values,
          ) as StwInventoryCategoryMenuValue[];
        } else if (select.customId === 'stw_inv_rarity') {
          state.rarities = applyMultiSelectState(
            state.rarities as string[],
            select.values,
          ) as StwInventoryRarityMenuValue[];
        } else {
          return;
        }

        const counts = await getCounts();
        await select.update(
          (await buildInventoryPanelPayload(
            state,
            lang,
            counts.total,
            counts.filtered,
            authorData,
            userId,
            locale,
          )) as any,
        );
        return;
      }

      if (!componentInteraction.isButton() || componentInteraction.customId !== 'stw_inv_generate') {
        return;
      }

      const button = componentInteraction as ButtonInteraction;
      await button.deferUpdate();

      const allItems = await loadSource(state.source);
      const filtered = filterInventoryItems(allItems, state);

      if (!filtered.length) {
        const hint = buildInventoryFilterHint(lang, state);
        const noMatch = await translateForUser(userId, 'stwInventoryImage.panel.noMatch', undefined, locale);
        const msg = hint ? `${noMatch} (${hint})` : noMatch;

        await interaction.editReply(
          (await buildInventoryPanelPayload(
            state,
            lang,
            allItems.length,
            0,
            authorData,
            userId,
            locale,
            'warning',
            `${getEmoji(client, 'error')} ${msg}`,
          )) as any,
        );
        return;
      }

      const loadingEmbed = await createInfoEmbed({
        description: `${getEmoji(client, 'loading')} ${await translateForUser(userId, 'stwInventoryImage.panel.loading', undefined, locale)}`,
        author: authorData ?? undefined,
      });
      await interaction.editReply(
        buildClassicEmbedEditPayload({ embeds: [loadingEmbed], components: [] }) as any,
      );

      const result = await generateStwInventoryPanelResult({
        items: filtered,
        source: state.source,
        lang: userLanguage as SupportedLanguage,
        header: { displayName: account.displayName || mainAccount.displayName || 'Account' },
        account: { accountId: account.accountId, accessToken: account.accessToken },
        discordUserId: userId,
      });

      const { totalCount, shownCount, truncated, pageCount, attachments } = result;
      const itemWord = await translateForUser(userId, 'stwInventoryImage.panel.item', undefined, locale);
      let hint = `${totalCount} ${itemWord}`;
      const filterHint = buildInventoryFilterHint(lang, state);
      if (filterHint) hint += ` · ${filterHint}`;
      if (hasActiveInventoryFilters(state) && totalCount < allItems.length) {
        hint += ` · ${await translateForUser(
          userId,
          'stwInventoryImage.panel.ofAccount',
          { total: String(allItems.length) },
          locale,
        )}`;
      }
      if (pageCount > 1) {
        hint += ` · ${await translateForUser(
          userId,
          'stwInventoryImage.panel.pageImages',
          { count: String(pageCount) },
          locale,
        )}`;
      }
      if (truncated || shownCount < totalCount) {
        hint += ` · ${await translateForUser(
          userId,
          'stwInventoryImage.panel.truncated',
          { shown: String(shownCount), total: String(totalCount) },
          locale,
        )}`;
      }

      await editInventoryGalleryReply(
        interaction,
        hint,
        attachments,
        authorData,
        userId,
        locale,
      );
      showingGallery = true;
    });

    collector.on('end', async () => {
      try {
        const msg = await interaction.fetchReply();
        const embeds = msg.embeds.map((embed) => EmbedBuilder.from(embed));

        if (showingGallery) {
          await interaction.editReply(
            buildClassicEmbedEditPayload({
              embeds,
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  await createBackButton(userId, locale, true),
                ),
              ],
            }) as any,
          );
          return;
        }

        const counts = await getCounts();
        const payload = await buildInventoryPanelPayload(
          state,
          lang,
          counts.total,
          counts.filtered,
          authorData,
          userId,
          locale,
        );
        await interaction.editReply({
          ...payload,
          embeds: embeds.length ? embeds : payload.embeds,
          components: await createInventoryActionRows(state, lang, userId, locale, true),
        } as any);
      } catch {
        /* */
      }
    });
  } catch (err: any) {
    const { log } = await import('#helpers/core/logger.ts');
    log.commands.error({ error: err?.message, stack: err?.stack }, '[INVENTORY] image error');
    const embed = await createErrorEmbed({
      description: await translateForUser(userId, 'stwInventoryImage.panel.error', undefined, locale),
      interaction,
    });
    await interaction.editReply(buildClassicEmbedEditPayload({ embeds: [embed], components: [] }) as any).catch(
      () => undefined,
    );
  }
}
