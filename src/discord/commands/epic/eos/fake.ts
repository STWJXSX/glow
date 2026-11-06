import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { buildDiscordLocalizations, buildLocalizedChoices } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import { handleLevel } from '#helpers/commands/epic/ghostequip/level.ts';
import { handleReady, handlePlaying, handleLobby } from '#helpers/commands/epic/ghostequip/status.ts';
import { handleMusic, handleMusicAutocomplete } from '#helpers/commands/epic/ghostequip/music.ts';
import { handleMarker, MARKER_CHOICE_VALUES } from '#helpers/commands/epic/ghostequip/marker.ts';
import {
  handleMetaChaos,
  handleMetaBugButtons,
  handleMetaHide,
  handleMetaMode,
  handleMetaReset,
  handleMetaSolo,
  handleMetaTempo,
} from '#helpers/commands/epic/ghostequip/partyMeta.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('fake')
    .setDescription('Fake your party lobby — status, level, music, markers and party meta')
    .setNameLocalizations(buildDiscordLocalizations('fake.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('fake.cmd._1'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('level')
        .setDescription('Set battle pass level in your party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.level.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._14'))
        .addStringOption(option =>
          option
            .setName('nivel')
            .setDescription('Level number')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.level.opt.nivel.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._15'))
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ready')
        .setDescription('Set your ready status in the party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.ready.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._20'))
        .addStringOption(option =>
          option
            .setName('estado')
            .setDescription('Select a status')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.ready.opt.estado.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._21'))
            .setRequired(true)
            .addChoices(
              ...buildLocalizedChoices('ghostequip.status.choices', [
                { value: 'ready' },
                { value: 'notready' },
                { value: 'sittingout' },
              ]),
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('playing')
        .setDescription('Simulate being in a match (hides from lobby)')
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
    .addSubcommand(subcommand =>
      subcommand
        .setName('music')
        .setDescription('Show a Fortnite Festival jam track in the party lobby')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.music.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._25'))
        .addStringOption(option =>
          option
            .setName('cancion')
            .setDescription('Select a jam track')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.music.opt.cancion.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._26'))
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('instrumento')
            .setDescription('Select an instrument')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.music.opt.instrumento.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._27'))
            .setRequired(true)
            .addChoices(
              ...buildLocalizedChoices('ghostequip.music.instruments', [
                { value: 'drums' },
                { value: 'guitar' },
                { value: 'bass' },
                { value: 'vocals' },
                { value: 'plasticBass' },
              ]),
            )
        )
        .addIntegerOption(option =>
          option
            .setName('tempo')
            .setDescription('Override the jam tempo in BPM (optional — defaults to track BPM)')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.music.opt.tempo.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._28'))
            .setRequired(false)
            .setMinValue(20)
            .setMaxValue(300)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('marker')
        .setDescription('Set or clear your BR pre-game map marker in the party')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.marker.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._33'))
        .addStringOption(option =>
          option
            .setName('ubicacion')
            .setDescription('Marker preset')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.marker.opt.ubicacion.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._34'))
            .setRequired(true)
            .addChoices(
              ...buildLocalizedChoices(
                'ghostequip.marker.presets',
                MARKER_CHOICE_VALUES.map((value) => ({ value })),
              ),
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('hide')
        .setDescription('Choose who to hide or show in the lobby squad (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.hide.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._35'))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('solo')
        .setDescription('Hide everyone except you from the lobby squad (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.solo.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._37'))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('tempo')
        .setDescription('Set the party-wide Festival jam tempo (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.tempo.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._38'))
        .addIntegerOption(option =>
          option
            .setName('bpm')
            .setDescription('Tempo in BPM')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.tempo.opt.bpm.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._39'))
            .setRequired(true)
            .setMinValue(20)
            .setMaxValue(300)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('modo')
        .setDescription('Change party game mode or creative island (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.modo.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._45'))
        .addStringOption(option =>
          option
            .setName('isla')
            .setDescription('Creative island code (XXXX-XXXX-XXXX) — skip menu and apply directly')
            .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.modo.opt.isla.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._47'))
            .setRequired(false)
            .setMinLength(12)
            .setMaxLength(14)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Restore the lobby to normal (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.reset.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._50'))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('chaos')
        .setDescription('Quickly change lobby game modes (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.chaos.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._53'))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('bug-buttons')
        .setDescription('Glitch lobby buttons (leader only)')
        .setNameLocalizations(buildDiscordLocalizations('ghostequip.cmd.bugbuttons.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('ghostequip.cmd._54'))
    )
    .setDMPermission(false) as any,

  auth: true,

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'music':
      case 'musica':
        await handleMusicAutocomplete(interaction);
        break;
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'level':
      case 'nivel':
        await handleLevel(interaction);
        break;
      case 'ready':
      case 'listo':
        await handleReady(interaction);
        break;
      case 'playing':
      case 'partida':
        await handlePlaying(interaction);
        break;
      case 'lobby':
        await handleLobby(interaction);
        break;
      case 'music':
      case 'musica':
        await handleMusic(interaction);
        break;
      case 'marker':
      case 'marcador':
        await handleMarker(interaction);
        break;
      case 'hide':
      case 'ocultar':
        await handleMetaHide(interaction);
        break;
      case 'solo':
        await handleMetaSolo(interaction);
        break;
      case 'tempo':
        await handleMetaTempo(interaction);
        break;
      case 'modo':
        await handleMetaMode(interaction);
        break;
      case 'reset':
      case 'restaurar':
        await handleMetaReset(interaction);
        break;
      case 'chaos':
        await handleMetaChaos(interaction);
        break;
      case 'bug-buttons':
      case 'bugbuttons':
        await handleMetaBugButtons(interaction);
        break;
    }
  },
};

export default command;
