import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { buildDiscordLocalizations, buildLocalizedChoices } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import { handleOutfit, handleOutfitAutocomplete } from '#helpers/commands/epic/ghostequip/outfit.ts';
import { handleBackpack, handleBackpackAutocomplete } from '#helpers/commands/epic/ghostequip/backpack.ts';
import { handleEmote, handleEmoteAutocomplete } from '#helpers/commands/epic/ghostequip/emote.ts';
import { handleBanner, handleBannerAutocomplete } from '#helpers/commands/epic/ghostequip/banner.ts';
import { handleClothes, handleClothesAutocomplete } from '#helpers/commands/epic/ghostequip/clothes.ts';
import { handleGlider, handleGliderAutocomplete } from '#helpers/commands/epic/ghostequip/glider.ts';
import { handleMimosa, handleMimosaAutocomplete } from '#helpers/commands/epic/ghostequip/mimosa.ts';
import { handleCar, handleCarAutocomplete } from '#helpers/commands/epic/ghostequip/car.ts';
import { handleRanked, RANK_TIER_INDICES } from '#helpers/commands/epic/ghostequip/ranked.ts';
import { handlePlaying, handleLobby } from '#helpers/commands/epic/ghostequip/status.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ghostequip')
    .setDescription('Equip cosmetics to your Fortnite party without owning them')
    .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._1'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('skin')
        .setDescription('Equip an outfit to your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.skin.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._2'))
        .addStringOption(option =>
          option
            .setName('skin')
            .setDescription('Select an outfit')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.skin.opt.skin.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._3'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('backpack')
        .setDescription('Equip a backpack to your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.backpack.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._4'))
        .addStringOption(option =>
          option
            .setName('mochila')
            .setDescription('Select a backpack')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.backpack.opt.mochila.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._5'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('emote')
        .setDescription('Equip an emote to your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.emote.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._6'))
        .addStringOption(option =>
          option
            .setName('baile')
            .setDescription('Select an emote')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.emote.opt.baile.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._7'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('banner')
        .setDescription('Equip a banner to your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.banner.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._8'))
        .addStringOption(option =>
          option
            .setName('banner')
            .setDescription('Select a banner')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.banner.opt.banner.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._9'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('shoes')
        .setDescription('Equip shoes to your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.shoes.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._10'))
        .addStringOption(option =>
          option
            .setName('zapatos')
            .setDescription('Select shoes')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.shoes.opt.zapatos.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._11'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('glider')
        .setDescription('Equip a glider to your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.glider.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._16'))
        .addStringOption(option =>
          option
            .setName('glider')
            .setDescription('Select a glider')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.glider.opt.glider.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._17'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('companion')
        .setDescription('Equip a lobby sidekick (Mimosa companion)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.companion.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._31'))
        .addStringOption(option =>
          option
            .setName('companero')
            .setDescription('Select a sidekick')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.companion.opt.companero.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._32'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('car')
        .setDescription('Equip a vehicle body in your party lobby')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.car.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._55'))
        .addStringOption(option =>
          option
            .setName('coche')
            .setDescription('Select a car body')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.car.opt.coche.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._56'))
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ranked')
        .setDescription('Set your visible ranked rank in the party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.ranked.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._18'))
        .addStringOption(option =>
          option
            .setName('rango')
            .setDescription('Select a rank')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.ranked.opt.rango.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._19'))
            .setRequired(true)
            .addChoices(
              ...buildLocalizedChoices(
                'ghostequip.ranked.tiers',
                RANK_TIER_INDICES.map((tierIndex) => ({ value: String(tierIndex) })),
              ),
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('match')
        .setDescription('Simulate being in a match (GhostMatch)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.playing.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._22'))
        .addIntegerOption(option =>
          option
            .setName('jugadores')
            .setDescription('Number of players remaining (default: 100)')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.playing.opt.jugadores.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._23'))
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(255)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('lobby')
        .setDescription('Return your account to lobby state')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.lobby.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._24'))
    )
    .setDMPermission(false) as any,

  auth: true,

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'skin':
        await handleOutfitAutocomplete(interaction);
        break;
      case 'backpack':
      case 'mochila':
        await handleBackpackAutocomplete(interaction);
        break;
      case 'emote':
      case 'baile':
        await handleEmoteAutocomplete(interaction);
        break;
      case 'banner':
        await handleBannerAutocomplete(interaction);
        break;
      case 'shoes':
      case 'zapatos':
        await handleClothesAutocomplete(interaction);
        break;
      case 'glider':
      case 'alas':
        await handleGliderAutocomplete(interaction);
        break;
      case 'companion':
      case 'companero':
        await handleMimosaAutocomplete(interaction);
        break;
      case 'car':
      case 'coche':
        await handleCarAutocomplete(interaction);
        break;
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'skin':
        await handleOutfit(interaction);
        break;
      case 'backpack':
      case 'mochila':
        await handleBackpack(interaction);
        break;
      case 'emote':
      case 'baile':
        await handleEmote(interaction);
        break;
      case 'banner':
        await handleBanner(interaction);
        break;
      case 'shoes':
      case 'zapatos':
        await handleClothes(interaction);
        break;
      case 'glider':
      case 'alas':
        await handleGlider(interaction);
        break;
      case 'companion':
      case 'companero':
        await handleMimosa(interaction);
        break;
      case 'car':
      case 'coche':
        await handleCar(interaction);
        break;
      case 'ranked':
        await handleRanked(interaction);
        break;
      case 'match':
      case 'playing':
        await handlePlaying(interaction);
        break;
      case 'lobby':
        await handleLobby(interaction);
        break;
    }
  },
};

export default command;
