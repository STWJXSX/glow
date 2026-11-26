import {
  ChatInputCommandInteraction,
  AttachmentBuilder,
  ContainerBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { AuthorData } from '#helpers/epic/account/avatarHandler.ts';
import {
  buildComponentsV2Payload,
  createComponentsV2Container,
  createLockerComponentsV2Container,
  type EmbedStyle,
  type LockerV2ActionRow,
} from '#helpers/core/embedHelper.ts';
import {
  epicEmojiLine,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { EPIC_NAV_IDLE_MS, isCollectorIdle, editReplyInactive } from '#helpers/commands/epic/epicCollectorHelper.ts';
import { resolveStwCollectionImageHeader } from './stwCollectionImageHeader.ts';
import { buildStwRarityMenuOptions, type StwRarityMenuValue } from '../inventory/stwRarityFilters.ts';
import { fetchCampaignProfileBody } from '#managers/images/stw/campaign/stwCardsRenderer.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
  prepareBulkAccounts,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkImagePaginated, type BulkImagePage } from '#helpers/core/bulkImagePaginator.ts';

/** Inactivity window before panel components are disabled (collector `idle`, not fixed `time`). */
export const COLLECTION_PANEL_TIMEOUT_MS = EPIC_NAV_IDLE_MS;

export interface CollectionImagePanelLabels {
  titleKey: string;
  itemKey: string;
  typePlaceholderKey: string;
  emptyKey: string;
  noMatchKey: string;
  loadingKey: string;
  errorKey: string;
}

export interface CollectionImageFilterState<TType extends string> {
  types: (TType | 'all')[];
  rarities: StwRarityMenuValue[];
}

export interface CollectionImagePanelConfig<TItem, TType extends string> {
  customIdPrefix: string;
  labels: CollectionImagePanelLabels;
  sortHintKey: string;
  typeChoices: { value: TType; en: string; es: string }[];
  labelTypeValue: (value: TType | 'all', lang: 'en' | 'es') => string;
  filterItems: (items: TItem[], state: CollectionImageFilterState<TType>) => TItem[];
  buildFilterHint: (lang: 'en' | 'es', state: CollectionImageFilterState<TType>) => string | null;
  generate: (ctx: {
    items: TItem[];
    userLanguage: import('#helpers/locales/index.ts').SupportedLanguage;
    header: Awaited<ReturnType<typeof resolveStwCollectionImageHeader>>;
    lang: 'en' | 'es';
    state: CollectionImageFilterState<TType> & Record<string, unknown>;
    /** When false, PNG omits baked-in profile bar (Discord embed author is used instead). */
    includeProfileHeader: boolean;
    account: { accountId: string; accessToken: string };
    profileBody: unknown;
    discordUserId: string;
  }) => Promise<{
    attachments: AttachmentBuilder[];
    totalCount: number;
    shownCount: number;
    truncated: boolean;
    pageCount: number;
  }>;
  extraActionRows?: (
    state: CollectionImageFilterState<TType> & Record<string, unknown>,
    userId: string,
    locale?: string | null,
    disabled?: boolean,
  ) => Promise<LockerV2ActionRow[]>;
  onExtraButton?: (
    customId: string,
    state: CollectionImageFilterState<TType> & Record<string, unknown>,
  ) => void;
  formatExtraPanelLines?: (
    state: CollectionImageFilterState<TType> & Record<string, unknown>,
    userId: string,
    locale?: string | null,
  ) => Promise<string>;
}

export async function formatMultiSelectLabels(
  values: string[],
  options: { value: string; label: string }[],
  allLabel: string,
  userId: string,
  locale?: string | null,
): Promise<string> {
  if (values.includes('all') || values.length === 0) return allLabel;
  if (values.length <= 3) {
    return values.map((v) => options.find((o) => o.value === v)?.label || v).join(', ');
  }
  return translateForUser(
    userId,
    'stwCollection.panel.selectedCount',
    { count: String(values.length) },
    locale,
  );
}

export function applyMultiSelectState(current: string[], selected: string[]): string[] {
  if (selected.includes('all') && selected.length > 1) {
    return selected.filter((v) => v !== 'all');
  }
  return selected;
}

export function hasActiveStwCollectionFilters<TType extends string>(
  state: Pick<CollectionImageFilterState<TType>, 'types' | 'rarities'>,
): boolean {
  const typesAll = state.types.length === 0
    || (state.types.length === 1 && state.types[0] === 'all');
  const raritiesAll = state.rarities.length === 0
    || (state.rarities.length === 1 && state.rarities[0] === 'all');
  return !typesAll || !raritiesAll;
}

function buildTypeMenuOptions<TType extends string>(
  choices: { value: TType; en: string; es: string }[],
  labelTypeValue: (value: TType | 'all', lang: 'en' | 'es') => string,
  lang: 'en' | 'es',
): { value: TType | 'all'; label: string }[] {
  return [
    { value: 'all', label: labelTypeValue('all', lang) },
    ...choices.map((c) => ({
      value: c.value,
      label: lang === 'es' ? c.es : c.en,
    })),
  ];
}

async function buildPanelContent<TItem, TType extends string>(
  config: CollectionImagePanelConfig<TItem, TType>,
  state: CollectionImageFilterState<TType> & Record<string, unknown>,
  userId: string,
  lang: 'en' | 'es',
  locale: string | null | undefined,
  accountTotal: number,
  filteredCount: number,
): Promise<string> {
  const typeOptions = buildTypeMenuOptions(config.typeChoices, config.labelTypeValue, lang);
  const rarityOptions = buildStwRarityMenuOptions(lang);
  const allTypes = config.labelTypeValue('all', lang);
  const allRarities = buildStwRarityMenuOptions(lang)[0].label;

  const typeLabel = await formatMultiSelectLabels(
    state.types as string[],
    typeOptions,
    allTypes,
    userId,
    locale,
  );
  const rarityLabel = await formatMultiSelectLabels(
    state.rarities,
    rarityOptions,
    allRarities,
    userId,
    locale,
  );
  const extra = (await config.formatExtraPanelLines?.(state, userId, locale)) ?? '';
  const itemWord = await translateForUser(userId, config.labels.itemKey, undefined, locale);

  const instructions = await translateForUser(userId, 'stwCollection.panel.instructions', undefined, locale);
  const typesLine = await translateForUser(userId, 'stwCollection.panel.typesLine', { types: typeLabel }, locale);
  const raritiesLine = await translateForUser(
    userId,
    'stwCollection.panel.raritiesLine',
    { rarities: rarityLabel },
    locale,
  );
  const inAccountKey = hasActiveStwCollectionFilters(state)
    ? 'stwCollection.panel.inAccountLineFiltered'
    : 'stwCollection.panel.inAccountLine';
  const inAccountLine = await translateForUser(
    userId,
    inAccountKey,
    hasActiveStwCollectionFilters(state)
      ? { total: String(accountTotal), filtered: String(filteredCount), item: itemWord }
      : { count: String(accountTotal), item: itemWord },
    locale,
  );

  return `${instructions}\n\n${typesLine}\n${raritiesLine}${extra ? `\n${extra}` : ''}\n${inAccountLine}`;
}

async function createFilterActionRows<TItem, TType extends string>(
  config: CollectionImagePanelConfig<TItem, TType>,
  state: CollectionImageFilterState<TType> & Record<string, unknown>,
  userId: string,
  lang: 'en' | 'es',
  locale: string | null | undefined,
  disabled = false,
): Promise<LockerV2ActionRow[]> {
  const prefix = config.customIdPrefix;
  const typeOptions = buildTypeMenuOptions(config.typeChoices, config.labelTypeValue, lang);

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}_type`)
    .setPlaceholder(await translateForUser(userId, config.labels.typePlaceholderKey, undefined, locale))
    .setDisabled(disabled)
    .setMinValues(1)
    .setMaxValues(typeOptions.length)
    .addOptions(
      typeOptions.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label.slice(0, 100))
          .setValue(opt.value)
          .setDefault((state.types as string[]).includes(opt.value)),
      ),
    );

  const rarityOptions = buildStwRarityMenuOptions(lang);
  const raritySelect = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}_rarity`)
    .setPlaceholder(await translateForUser(userId, 'stwCollection.panel.raritiesPlaceholder', undefined, locale))
    .setDisabled(disabled)
    .setMinValues(1)
    .setMaxValues(rarityOptions.length)
    .addOptions(
      rarityOptions.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label.slice(0, 100))
          .setValue(opt.value)
          .setDefault(state.rarities.includes(opt.value)),
      ),
    );

  const generateButton = new ButtonBuilder()
    .setCustomId(`${prefix}_generate`)
    .setLabel(await translateForUser(userId, 'stwCollection.panel.generateButton', undefined, locale))
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const rows: LockerV2ActionRow[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(typeSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(raritySelect),
  ];

  const extra = (await config.extraActionRows?.(state, userId, locale, disabled)) ?? [];
  rows.push(...extra);
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(generateButton));
  return rows;
}

async function createBackButton(
  customIdPrefix: string,
  userId: string,
  locale?: string | null,
): Promise<ButtonBuilder> {
  return new ButtonBuilder()
    .setCustomId(`${customIdPrefix}_back`)
    .setLabel(await translateForUser(userId, 'stwCollection.panel.back', undefined, locale))
    .setStyle(ButtonStyle.Secondary);
}

async function createBackActionRow(
  customIdPrefix: string,
  userId: string,
  locale?: string | null,
): Promise<ActionRowBuilder<ButtonBuilder>> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    await createBackButton(customIdPrefix, userId, locale),
  );
}

async function buildPanelContainer<TItem, TType extends string>(
  config: CollectionImagePanelConfig<TItem, TType>,
  state: CollectionImageFilterState<TType> & Record<string, unknown>,
  userId: string,
  lang: 'en' | 'es',
  locale: string | null | undefined,
  accountTotal: number,
  filteredCount: number,
  authorData: Awaited<ReturnType<typeof getEpicAuthor>>,
  style: EmbedStyle = 'info',
  disabled = false,
): Promise<ContainerBuilder> {
  const title = await translateForUser(userId, config.labels.titleKey, undefined, locale);
  const content = await buildPanelContent(
    config,
    state,
    userId,
    lang,
    locale,
    accountTotal,
    filteredCount,
  );
  return createLockerComponentsV2Container(
    style,
    `## ${title}\n\n${content}`,
    await createFilterActionRows(config, state, userId, lang, locale, disabled),
    authorData,
  );
}

/** V2 gallery on the same message (MediaGallery + attachment://). */
async function buildGalleryContainer(
  hint: string,
  attachmentUrls: string[],
  authorData: AuthorData | null,
  customIdPrefix: string,
  userId: string,
  locale?: string | null,
  style: EmbedStyle = 'info',
): Promise<ContainerBuilder> {
  const container = createComponentsV2Container({
    style,
    content: hint,
    author: authorData,
  });

  if (attachmentUrls.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    const gallery = new MediaGalleryBuilder();
    for (const url of attachmentUrls) {
      gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
    }
    container.addMediaGalleryComponents(gallery);
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(await createBackActionRow(customIdPrefix, userId, locale));
  return container;
}

async function editCollectionImageGalleryReply(
  interaction: ChatInputCommandInteraction,
  hint: string,
  attachments: AttachmentBuilder[],
  authorData: AuthorData | null,
  customIdPrefix: string,
  userId: string,
  locale?: string | null,
): Promise<void> {
  const attachmentUrls = attachments.map((file, index) => {
    const fileName = file.name ?? `stw-collection-${index + 1}.webp`;
    return `attachment://${fileName}`;
  });

  await interaction.editReply(
    buildComponentsV2Payload(
      await buildGalleryContainer(
        hint,
        attachmentUrls,
        authorData,
        customIdPrefix,
        userId,
        locale,
      ),
      { files: attachments },
    ) as any,
  );
}

export async function runCollectionImagePanel<TItem, TType extends string>(
  interaction: ChatInputCommandInteraction,
  config: CollectionImagePanelConfig<TItem, TType>,
  fetchItems: (accountId: string, accessToken: string, profileBody?: unknown) => Promise<TItem[]>,
  logTag: string,
  initialExtra: Record<string, unknown> = {},
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const userLanguage = await getUserLanguage(userId, locale);
  const lang = userLanguage === 'es' ? 'es' : 'en';

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

    const profileBody = await fetchCampaignProfileBody(account.accountId, account.accessToken);
    const allItems = await fetchItems(account.accountId, account.accessToken, profileBody);
    if (!allItems.length) {
      await replyEpicCustomError(interaction, userId, config.labels.emptyKey);
      return;
    }

    const authorData = await getEpicAuthor(userId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName || mainAccount.displayName || 'Account',
    });

    const accountTotal = allItems.length;
    const prefix = config.customIdPrefix;
    let state = {
      types: ['all'] as (TType | 'all')[],
      rarities: ['all'] as StwRarityMenuValue[],
      ...initialExtra,
    };
    const getFilteredCount = () => config.filterItems(allItems, state).length;

    const reply = await interaction.editReply(
      buildComponentsV2Payload(
        await buildPanelContainer(
          config,
          state,
          userId,
          lang,
          locale,
          accountTotal,
          getFilteredCount(),
          authorData,
        ),
      ) as any,
    );

    const collector = reply.createMessageComponentCollector({
      idle: EPIC_NAV_IDLE_MS,
    });

    let showingGallery = false;
    let panelGeneration = 0;

    collector.on('collect', async (componentInteraction) => {
      if (componentInteraction.user.id !== userId) {
        await componentInteraction.reply({
          content: epicEmojiLine(
            client,
            'error',
            await translateForUser(userId, 'epic.errors.onlyAuthor', undefined, locale),
          ),
          ephemeral: true,
        });
        return;
      }

      if (componentInteraction.isStringSelectMenu()) {
        const select = componentInteraction as StringSelectMenuInteraction;
        if (select.customId === `${prefix}_type`) {
          state.types = applyMultiSelectState(state.types as string[], select.values) as (TType | 'all')[];
        } else if (select.customId === `${prefix}_rarity`) {
          state.rarities = applyMultiSelectState(state.rarities, select.values) as StwRarityMenuValue[];
        } else {
          return;
        }

        await select.update(
          buildComponentsV2Payload(
            await buildPanelContainer(
              config,
              state,
              userId,
              lang,
              locale,
              accountTotal,
              getFilteredCount(),
              authorData,
            ),
          ) as any,
        );
        return;
      }

      if (componentInteraction.isButton()) {
        const button = componentInteraction as ButtonInteraction;

        if (button.customId === `${prefix}_back`) {
          await button.deferUpdate();
          showingGallery = false;
          await interaction.editReply(
            buildComponentsV2Payload(
              await buildPanelContainer(
                config,
                state,
                userId,
                lang,
                locale,
                accountTotal,
                getFilteredCount(),
                authorData,
              ),
            ) as any,
          );
          return;
        }

        if (button.customId !== `${prefix}_generate`) {
          config.onExtraButton?.(button.customId, state);
          await button.update(
            buildComponentsV2Payload(
              await buildPanelContainer(
                config,
                state,
                userId,
                lang,
                locale,
                accountTotal,
                getFilteredCount(),
                authorData,
              ),
            ) as any,
          );
          return;
        }

        await button.deferUpdate();

        const capturedState = {
          types: [...state.types] as (TType | 'all')[],
          rarities: [...state.rarities] as StwRarityMenuValue[],
        };
        const filtered = config.filterItems(allItems, capturedState);
        const generation = ++panelGeneration;
        if (!filtered.length) {
          const filterHint = config.buildFilterHint(lang, capturedState);
          const noMatch = await translateForUser(userId, config.labels.noMatchKey, undefined, locale);
          const msg = filterHint ? `${noMatch} (${filterHint})` : noMatch;
          const title = await translateForUser(userId, config.labels.titleKey, undefined, locale);
          const panelContent = await buildPanelContent(
            config,
            capturedState,
            userId,
            lang,
            locale,
            accountTotal,
            filtered.length,
          );

          await interaction.editReply(
            buildComponentsV2Payload(
              createLockerComponentsV2Container(
                'warning',
                `## ${title}\n\n${panelContent}\n\n${epicEmojiLine(client, 'error', msg)}`,
                await createFilterActionRows(config, capturedState, userId, lang, locale),
                authorData,
              ),
            ) as any,
          );
          return;
        }

        showingGallery = false;

        const loadingText = await translateForUser(userId, config.labels.loadingKey, undefined, locale);
        await interaction.editReply(
          buildComponentsV2Payload(
            createComponentsV2Container({
              style: 'info',
              content: `${getEmoji(client, 'loading')} ${loadingText}`,
              author: authorData,
            }),
          ) as any,
        );

        const header = await resolveStwCollectionImageHeader(userId, {
          accountId: account.accountId,
          accessToken: account.accessToken,
          displayName: account.displayName || mainAccount.displayName || 'Account',
        });

        let result: Awaited<ReturnType<typeof config.generate>>;
        try {
          result = await config.generate({
            items: filtered,
            userLanguage,
            header,
            lang,
            state: capturedState,
            includeProfileHeader: false,
            account: { accountId: account.accountId, accessToken: account.accessToken },
            profileBody,
            discordUserId: userId,
          });
        } catch (err: unknown) {
          if (generation !== panelGeneration) return;
          const { log } = await import('#helpers/core/logger.ts');
          log.commands.error(
            { error: (err as Error)?.message, stack: (err as Error)?.stack },
            logTag,
          );
          const errorMsg = await translateForUser(userId, config.labels.errorKey, undefined, locale);
          const title = await translateForUser(userId, config.labels.titleKey, undefined, locale);
          const panelContent = await buildPanelContent(
            config,
            state,
            userId,
            lang,
            locale,
            accountTotal,
            getFilteredCount(),
          );
          await interaction.editReply(
            buildComponentsV2Payload(
              createLockerComponentsV2Container(
                'warning',
                `## ${title}\n\n${panelContent}\n\n${epicEmojiLine(client, 'error', errorMsg)}`,
                await createFilterActionRows(config, state, userId, lang, locale),
                authorData,
              ),
            ) as any,
          );
          return;
        }

        if (generation !== panelGeneration) return;

        const filterHint = config.buildFilterHint(lang, capturedState);
        const itemWord = await translateForUser(userId, config.labels.itemKey, undefined, locale);
        const sortHint = await translateForUser(userId, config.sortHintKey, undefined, locale);

        let hint = `${result.totalCount} ${itemWord}`;
        if (filterHint) hint += ` · ${filterHint}`;
        hint += ` · ${sortHint}`;

        if (filterHint && result.totalCount < accountTotal) {
          hint += ` · ${await translateForUser(
            userId,
            'stwCollection.panel.ofAccount',
            { total: String(accountTotal) },
            locale,
          )}`;
        }

        if (result.pageCount > 1) {
          hint += ` · ${await translateForUser(
            userId,
            'stwCollection.panel.pageImages',
            { count: String(result.pageCount) },
            locale,
          )}`;
        }

        if (result.truncated || result.shownCount < result.totalCount) {
          hint += ` · ${await translateForUser(
            userId,
            'stwCollection.panel.truncated',
            { shown: String(result.shownCount), total: String(result.totalCount) },
            locale,
          )}`;
        }

        await editCollectionImageGalleryReply(
          interaction,
          hint,
          result.attachments,
          authorData,
          prefix,
          userId,
          locale,
        );
        showingGallery = true;
      }
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      const inactive = await translateForUser(userId, 'epic.inactivePanel', undefined, locale);
      await editReplyInactive(interaction, inactive).catch(() => undefined);
    });
  } catch (err: any) {
    const { log } = await import('#helpers/core/logger.ts');
    log.commands.error({ error: err?.message, stack: err?.stack }, logTag);
    await replyEpicCustomError(interaction, userId, config.labels.errorKey);
  }
}

async function buildCollectionImageHint<TItem, TType extends string>(
  config: CollectionImagePanelConfig<TItem, TType>,
  result: Awaited<ReturnType<CollectionImagePanelConfig<TItem, TType>['generate']>>,
  defaultState: CollectionImageFilterState<TType> & Record<string, unknown>,
  accountTotal: number,
  userId: string,
  lang: 'en' | 'es',
  locale: string | null | undefined,
): Promise<string> {
  const filterHint = config.buildFilterHint(lang, defaultState);
  const itemWord = await translateForUser(userId, config.labels.itemKey, undefined, locale);
  const sortHint = await translateForUser(userId, config.sortHintKey, undefined, locale);

  let hint = `${result.totalCount} ${itemWord}`;
  if (filterHint) hint += ` · ${filterHint}`;
  hint += ` · ${sortHint}`;

  if (filterHint && result.totalCount < accountTotal) {
    hint += ` · ${await translateForUser(
      userId,
      'stwCollection.panel.ofAccount',
      { total: String(accountTotal) },
      locale,
    )}`;
  }

  if (result.pageCount > 1) {
    hint += ` · ${await translateForUser(
      userId,
      'stwCollection.panel.pageImages',
      { count: String(result.pageCount) },
      locale,
    )}`;
  }

  if (result.truncated || result.shownCount < result.totalCount) {
    hint += ` · ${await translateForUser(
      userId,
      'stwCollection.panel.truncated',
      { shown: String(result.shownCount), total: String(result.totalCount) },
      locale,
    )}`;
  }

  return hint;
}

/** Bulk mode: one account per page with generated collection image(s). */
export async function runCollectionImageBulk<TItem, TType extends string>(
  interaction: ChatInputCommandInteraction,
  config: CollectionImagePanelConfig<TItem, TType>,
  fetchItems: (accountId: string, accessToken: string, profileBody?: unknown) => Promise<TItem[]>,
  logTag: string,
  initialExtra: Record<string, unknown> = {},
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const userLanguage = await getUserLanguage(userId, locale);
  const lang = userLanguage === 'es' ? 'es' : 'en';

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const readyAccounts = await prepareBulkAccounts(interaction, user);
    const defaultState = {
      types: ['all'] as (TType | 'all')[],
      rarities: ['all'] as StwRarityMenuValue[],
      ...initialExtra,
    };

    const loadingText = await translateForUser(userId, config.labels.loadingKey, undefined, locale);
    await interaction.editReply(
      buildComponentsV2Payload(
        createComponentsV2Container({
          style: 'info',
          content: `${getEmoji(client, 'loading')} ${loadingText}`,
        }),
      ) as any,
    );

    const imagePages: BulkImagePage[] = [];

    for (const { account, ok, error } of readyAccounts) {
      const accountLabel = buildBulkAccountLabel(client, account.displayName, account.cuentaMain);

      if (!ok) {
        const field = await buildBulkAuthErrorField(client, userId, account, error, locale);
        imagePages.push({
          accountLabel: field.name,
          hint: field.value,
          attachments: [],
          style: 'error',
        });
        continue;
      }

      try {
        const profileBody = await fetchCampaignProfileBody(account.accountId, account.accessToken);
        const allItems = await fetchItems(account.accountId, account.accessToken, profileBody);

        if (!allItems.length) {
          const empty = await translateForUser(userId, config.labels.emptyKey, undefined, locale);
          imagePages.push({ accountLabel, hint: empty, attachments: [], style: 'info' });
          continue;
        }

        const accountTotal = allItems.length;
        const filtered = config.filterItems(allItems, defaultState);

        if (!filtered.length) {
          const noMatch = await translateForUser(userId, config.labels.noMatchKey, undefined, locale);
          imagePages.push({ accountLabel, hint: noMatch, attachments: [], style: 'warning' });
          continue;
        }

        const header = await resolveStwCollectionImageHeader(userId, {
          accountId: account.accountId,
          accessToken: account.accessToken,
          displayName: account.displayName,
        });

        const result = await config.generate({
          items: filtered,
          userLanguage,
          header,
          lang,
          state: defaultState,
          includeProfileHeader: false,
          account: { accountId: account.accountId, accessToken: account.accessToken },
          profileBody,
          discordUserId: userId,
        });

        const hint = await buildCollectionImageHint(
          config,
          result,
          defaultState,
          accountTotal,
          userId,
          lang,
          locale,
        );

        imagePages.push({
          accountLabel,
          hint,
          attachments: result.attachments,
          style: 'info',
        });
      } catch (err: unknown) {
        const { log } = await import('#helpers/core/logger.ts');
        log.commands.error(
          { error: (err as Error)?.message, stack: (err as Error)?.stack },
          logTag,
        );
        const errorMsg = await translateForUser(userId, config.labels.errorKey, undefined, locale);
        imagePages.push({
          accountLabel,
          hint: epicEmojiLine(client, 'error', errorMsg),
          attachments: [],
          style: 'error',
        });
      }
    }

    const collectionName = await translateForUser(userId, config.labels.titleKey, undefined, locale);
    const title = await translateForUser(
      userId,
      'stwCollection.bulk.title',
      { count: String(readyAccounts.length), collection: collectionName },
      locale,
    );
    const summary = await translateForUser(userId, 'stwCollection.bulk.summary', undefined, locale);

    if (!imagePages.length) {
      await replyEpicCustomError(interaction, userId, config.labels.errorKey);
      return;
    }

    await sendBulkImagePaginated(interaction, title, summary, imagePages);
  } catch (err: unknown) {
    const { log } = await import('#helpers/core/logger.ts');
    log.commands.error({ error: (err as Error)?.message, stack: (err as Error)?.stack }, logTag);
    await replyEpicCustomError(interaction, userId, config.labels.errorKey);
  }
}
