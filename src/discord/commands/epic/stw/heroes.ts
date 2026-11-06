import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import {
  fetchCampaignHeroes,
  type CampaignHeroItem,
} from '#helpers/epic/stw/collection/stwCampaignHeroes.ts';
import {
  buildHeroFilterHint,
  filterCampaignHeroesMulti,
  HERO_CLASS_FILTER_CHOICES,
  labelForHeroClassMenuValue,
  type HeroClassFilterOption,
  type HeroClassMenuValue,
} from '#helpers/epic/stw/inventory/stwHeroFilters.ts';
import { generateStwCardsPanelResult } from '#managers/images/stw/index.ts';
import {
  runCollectionImagePanel,
  runCollectionImageBulk,
  type CollectionImagePanelConfig,
} from '#helpers/epic/stw/collection/stwCollectionImagePanel.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyEpicCredentialError } from '#helpers/commands/epic/epicEmbedHelper.ts';

const HEROES_PANEL_CONFIG: CollectionImagePanelConfig<CampaignHeroItem, HeroClassFilterOption> = {
  customIdPrefix: 'stw_hero',
  labels: {
    titleKey: 'stwCollection.heroes.title',
    itemKey: 'stwCollection.heroes.item',
    typePlaceholderKey: 'stwCollection.heroes.typePlaceholder',
    emptyKey: 'stwCollection.heroes.empty',
    noMatchKey: 'stwCollection.heroes.noMatch',
    loadingKey: 'stwCollection.heroes.loading',
    errorKey: 'stwCollection.heroes.error',
  },
  sortHintKey: 'stwCollection.panel.sortHint',
  typeChoices: HERO_CLASS_FILTER_CHOICES,
  labelTypeValue: labelForHeroClassMenuValue,
  filterItems: (items, state) =>
    filterCampaignHeroesMulti(items, { types: state.types as HeroClassMenuValue[], rarities: state.rarities }),
  buildFilterHint: (lang, state) =>
    buildHeroFilterHint(lang, {
      types: state.types as HeroClassMenuValue[],
      rarities: state.rarities,
    }),
  generate: ({ items, header, account, profileBody, discordUserId, userLanguage }) =>
    generateStwCardsPanelResult('heroes', { items, header, account, profileBody, discordUserId, lang: userLanguage }),
};

async function handleImageHeroesBulk(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImageBulk(
    interaction,
    HEROES_PANEL_CONFIG,
    fetchCampaignHeroes,
    '[HEROES] bulk image error',
  );
}

async function handleImageHeroes(interaction: ChatInputCommandInteraction): Promise<void> {
  await runCollectionImagePanel(
    interaction,
    HEROES_PANEL_CONFIG,
    fetchCampaignHeroes,
    '[HEROES] image error',
  );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('heroes')
    .setDescription('View your Save The World hero collection')
    .setNameLocalizations(buildDiscordLocalizations('heroes.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('heroes.cmd._1'))
    .addSubcommand((sub) =>
      addBulkOption(
        sub
          .setName('image')
          .setDescription('All heroes in your account as an image grid')
          .setNameLocalizations(buildDiscordLocalizations('heroes.cmd.image.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('heroes.cmd._2')),
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
        await handleImageHeroesBulk(interaction);
        return;
      }
      await handleImageHeroes(interaction);
    }
  },
};

export default command;
