import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import { buildDiscordLocalizations, translateForUser, getUserLanguage } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import {
  fetchCampaignSchematics,
  findCampaignSchematic,
} from '#helpers/epic/stw/collection/stwCampaignSchematics.ts';
import {
  buildSchematicFilterHintMulti,
  filterSchematicItemsMulti,
  labelForTypeMenuValue,
  SCHEMATIC_TYPE_FILTER_CHOICES,
  type SchematicRarityMenuValue,
  type SchematicTypeFilterOption,
  type SchematicTypeMenuValue,
} from '#helpers/epic/stw/inventory/stwSchematicFilters.ts';
import { generateStwCardsPanelResult } from '#managers/images/stw/index.ts';
import {
  runCollectionImagePanel,
  runCollectionImageBulk,
  type CollectionImagePanelConfig,
} from '#helpers/epic/stw/collection/stwCollectionImagePanel.ts';
import { runSchematicViewPanel } from '#helpers/epic/stw/collection/stwSchematicViewPanel.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { translateItemName } from '#helpers/locales/gameTranslations.ts';
import { getStwPowerLevel } from '#helpers/epic/stw/gameplay/stwPowerLevel.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

/** Short-lived cache so autocomplete stays under Discord's 3s limit. */
const schematicAutocompleteCache = new Map<string, {
  choices: { name: string; value: string }[];
  expiry: number;
}>();
const SCHEMATIC_AC_CACHE_MS = 45_000;

async function respondAutocomplete(
  interaction: AutocompleteInteraction,
  choices: { name: string; value: string }[],
): Promise<void> {
  if (interaction.responded) return;
  await interaction.respond(choices.slice(0, 25));
}

const SCHEMATICS_PANEL_CONFIG: CollectionImagePanelConfig<
  Awaited<ReturnType<typeof fetchCampaignSchematics>>[number],
  SchematicTypeFilterOption
> = {
  customIdPrefix: 'stw_sch',
  labels: {
    titleKey: 'stwCollection.schematics.title',
    itemKey: 'stwCollection.schematics.item',
    typePlaceholderKey: 'stwCollection.schematics.typePlaceholder',
    emptyKey: 'stwCollection.schematics.empty',
    noMatchKey: 'stwCollection.schematics.noMatch',
    loadingKey: 'stwCollection.schematics.loading',
    errorKey: 'stwCollection.schematics.error',
  },
  sortHintKey: 'stwCollection.panel.sortHint',
  typeChoices: SCHEMATIC_TYPE_FILTER_CHOICES,
  labelTypeValue: labelForTypeMenuValue,
  filterItems: (items, state) =>
    filterSchematicItemsMulti(items, { types: state.types as SchematicTypeMenuValue[], rarities: state.rarities }),
  buildFilterHint: (lang, state) =>
    buildSchematicFilterHintMulti(lang, {
      types: state.types as SchematicTypeMenuValue[],
      rarities: state.rarities as SchematicRarityMenuValue[],
    }),
  generate: ({ items, header, account, profileBody, discordUserId, userLanguage }) =>
    generateStwCardsPanelResult('schematics', { items, header, account, profileBody, discordUserId, lang: userLanguage }),
};

async function handleImageSchematicsBulk(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImageBulk(
    interaction,
    SCHEMATICS_PANEL_CONFIG,
    fetchCampaignSchematics,
    '[SCHEMATICS] bulk image error',
  );
}

async function handleImageSchematics(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImagePanel(
    interaction,
    SCHEMATICS_PANEL_CONFIG,
    fetchCampaignSchematics,
    '[SCHEMATICS] image error',
  );
}

async function handleSchematicAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const discordId = interaction.user.id;
  const locale = interaction.locale;
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo?.deviceAuths?.length) {
      await respondAutocomplete(interaction, [{
        name: await translateForUser(discordId, 'schematics.autocomplete.noAccount', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const mainAccount = userInfo.deviceAuths.find((a) => a.cuentaMain);
    if (!mainAccount?.accessToken) {
      await respondAutocomplete(interaction, [{
        name: await translateForUser(discordId, 'schematics.autocomplete.noMain', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    const cacheKey = mainAccount.accountId;
    const cached = schematicAutocompleteCache.get(cacheKey);
    let choices: { name: string; value: string }[];

    if (cached && cached.expiry > Date.now()) {
      choices = cached.choices;
    } else {
      const lang = (await getUserLanguage(discordId, locale)) as SupportedLanguage;
      const schematics = await fetchCampaignSchematics(mainAccount.accountId, mainAccount.accessToken);

      if (schematics.length === 0) {
        await respondAutocomplete(interaction, [{
          name: await translateForUser(discordId, 'schematics.autocomplete.noSchematics', undefined, locale),
          value: 'none',
        }]);
        return;
      }

      choices = schematics.map((sch) => {
        const name = translateItemName(sch.templateId, lang);
        const power = getStwPowerLevel(sch.rarity, sch.level);
        const label = `${name} · L${sch.level} · PL${power}`.slice(0, 100);
        return { name: label, value: sch.itemId };
      });

      schematicAutocompleteCache.set(cacheKey, {
        choices,
        expiry: Date.now() + SCHEMATIC_AC_CACHE_MS,
      });
    }

    const filtered = focused
      ? choices.filter((c) => c.name.toLowerCase().includes(focused))
      : choices;

    if (filtered.length === 0) {
      await respondAutocomplete(interaction, [{
        name: await translateForUser(discordId, 'schematics.autocomplete.noMatch', undefined, locale),
        value: 'none',
      }]);
      return;
    }

    await respondAutocomplete(interaction, filtered);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.commands.error({ error: message }, '[SCHEMATICS] Autocomplete error');
    if (!interaction.responded) {
      await interaction.respond([{
        name: await translateForUser(discordId, 'schematics.autocomplete.authError', undefined, locale),
        value: 'none',
      }]).catch(() => {});
    }
  }
}

async function handleViewSchematic(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const itemId = interaction.options.getString('schematic', true);

  if (itemId === 'none') {
    await replyEpicCustomError(interaction, userId, 'schematics.view.errors.invalidSelection');
    return;
  }

  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  const mainAccount = userInfo.deviceAuths.find((a) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  await replyWithEpicEmbed(interaction, userId, {
    loading: true,
    title: await translateForUser(userId, 'schematics.view.loading', undefined, locale),
  });

  const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
  if (!account) {
    await replyEpicCustomError(interaction, userId, 'schematics.view.errors.fetchFailed');
    return;
  }

  const schematics = await fetchCampaignSchematics(account.accountId, account.accessToken);
  const schematic = findCampaignSchematic(schematics, itemId);

  if (!schematic) {
    await replyEpicCustomError(interaction, userId, 'schematics.view.errors.notFound');
    return;
  }

  await runSchematicViewPanel(interaction, schematic, {
    accountId: account.accountId,
    accessToken: account.accessToken,
  });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('schematics')
    .setDescription('View your Save The World schematic collection')
    .setNameLocalizations(buildDiscordLocalizations('schematics.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('schematics.cmd._1'))
    .addSubcommand((sub) =>
      addBulkOption(
        sub
          .setName('image')
          .setDescription('Schematics in your account as image grid(s)')
          .setNameLocalizations(buildDiscordLocalizations('schematics.cmd.image.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('schematics.cmd._2')),
        'stwCollection.bulk.optionDescription',
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View and upgrade a schematic from your account')
        .setNameLocalizations(buildDiscordLocalizations('schematics.cmd.view.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('schematics.cmd.view.description'))
        .addStringOption((opt) =>
          opt
            .setName('schematic')
            .setDescription('Schematic to view')
            .setNameLocalizations(buildDiscordLocalizations('schematics.cmd.view.options.schematic.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('schematics.cmd.view.options.schematic.description'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .setDMPermission(true),

  auth: true,
  cooldown: 20,
  nodefer: false,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);
    const isSchematicOption = focused.name === 'schematic' || focused.name === 'esquema';

    if ((sub === 'view' || sub === 'ver') && isSchematicOption) {
      await handleSchematicAutocomplete(interaction);
      return;
    }

    if (!interaction.responded) {
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === 'image' || sub === 'imagen') {
      if (interaction.options.getBoolean('bulk')) {
        if (!await guardBulkMode(interaction)) return;
        const user = await UsuarioInfo.findOne({ id: interaction.user.id });
        if (!user?.deviceAuths?.length) {
          await replyEpicCredentialError(interaction, interaction.user.id, 'noCuenta');
          return;
        }
        await handleImageSchematicsBulk(interaction);
        return;
      }
      await handleImageSchematics(interaction);
      return;
    }

    if (sub === 'view' || sub === 'ver') {
      await handleViewSchematic(interaction);
    }
  },
};

export default command;
