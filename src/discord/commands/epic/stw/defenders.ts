import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import {
  fetchCampaignDefenders,
  type CampaignDefenderItem,
} from '#helpers/epic/stw/collection/stwCampaignDefenders.ts';
import {
  buildDefenderFilterHint,
  DEFENDER_TYPE_FILTER_CHOICES,
  filterCampaignDefendersMulti,
  labelForDefenderTypeMenuValue,
  type DefenderTypeFilterOption,
  type DefenderTypeMenuValue,
} from '#helpers/epic/stw/inventory/stwDefenderFilters.ts';
import { generateStwCardsPanelResult } from '#managers/images/stw/index.ts';
import {
  runCollectionImagePanel,
  runCollectionImageBulk,
  type CollectionImagePanelConfig,
} from '#helpers/epic/stw/collection/stwCollectionImagePanel.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyEpicCredentialError } from '#helpers/commands/epic/epicEmbedHelper.ts';

const DEFENDERS_PANEL_CONFIG: CollectionImagePanelConfig<CampaignDefenderItem, DefenderTypeFilterOption> = {
  customIdPrefix: 'stw_def',
  labels: {
    titleKey: 'stwCollection.defenders.title',
    itemKey: 'stwCollection.defenders.item',
    typePlaceholderKey: 'stwCollection.defenders.typePlaceholder',
    emptyKey: 'stwCollection.defenders.empty',
    noMatchKey: 'stwCollection.defenders.noMatch',
    loadingKey: 'stwCollection.defenders.loading',
    errorKey: 'stwCollection.defenders.error',
  },
  sortHintKey: 'stwCollection.panel.sortHint',
  typeChoices: DEFENDER_TYPE_FILTER_CHOICES,
  labelTypeValue: labelForDefenderTypeMenuValue,
  filterItems: (items, state) =>
    filterCampaignDefendersMulti(items, {
      types: state.types as DefenderTypeMenuValue[],
      rarities: state.rarities,
    }),
  buildFilterHint: (lang, state) =>
    buildDefenderFilterHint(lang, {
      types: state.types as DefenderTypeMenuValue[],
      rarities: state.rarities,
    }),
  generate: ({ items, header, account, profileBody, discordUserId, userLanguage }) =>
    generateStwCardsPanelResult('defenders', { items, header, account, profileBody, discordUserId, lang: userLanguage }),
};

async function handleImageDefendersBulk(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImageBulk(
    interaction,
    DEFENDERS_PANEL_CONFIG,
    fetchCampaignDefenders,
    '[DEFENDERS] bulk image error',
  );
}

async function handleImageDefenders(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImagePanel(
    interaction,
    DEFENDERS_PANEL_CONFIG,
    fetchCampaignDefenders,
    '[DEFENDERS] image error',
  );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('defenders')
    .setDescription('View your Save The World defender collection')
    .setNameLocalizations(buildDiscordLocalizations('defenders.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('defenders.cmd._1'))
    .addSubcommand((sub) =>
      addBulkOption(
        sub
          .setName('image')
          .setDescription('All defenders in your account as image grid(s)')
          .setNameLocalizations(buildDiscordLocalizations('defenders.cmd.image.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('defenders.cmd._2')),
        'stwCollection.bulk.optionDescription',
      ),
    )
    .setDMPermission(true),

  auth: true,
  cooldown: 20,
  nodefer: false,

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
        await handleImageDefendersBulk(interaction);
        return;
      }
      await handleImageDefenders(interaction);
    }
  },
};

export default command;
