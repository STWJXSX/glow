import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import { handleKick } from '#helpers/commands/epic/party/kick.ts';
import { handleKickCollect } from '#helpers/commands/epic/party/kickCollect.ts';
import { handleKickCollectAll } from '#helpers/commands/epic/party/kickCollectAll.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicks you from the current party immediately')
    .setNameLocalizations(buildDiscordLocalizations('kick.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('kick.cmd._1'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('collect')
        .setDescription('Kicks you from the party and collects rewards if you completed STW mission')
        .setNameLocalizations(buildDiscordLocalizations('kick.cmd.collect.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('kick.cmd._2'))
        .addBooleanOption((option) =>
          option
            .setName('force')
            .setDescription('Force kick even if mission not completed')
            .setNameLocalizations(buildDiscordLocalizations('kick.cmd.options.force.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('kick.cmd._3'))
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('collectall')
        .setDescription('Kicks you from the party and collects all pending rewards (Coming soon)')
        .setNameLocalizations(buildDiscordLocalizations('kick.cmd.collectall.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('kick.cmd._4'))
        .addBooleanOption((option) =>
          option
            .setName('force')
            .setDescription('Force kick even if mission not completed')
            .setNameLocalizations(buildDiscordLocalizations('kick.cmd.options.force.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('kick.cmd._3'))
            .setRequired(false),
        ),
    ) as SlashCommandBuilder,
  auth: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand(false);

    if (!subcommand) {
      await handleKick(interaction);
    } else if (subcommand === 'collect') {
      await handleKickCollect(interaction);
    } else if (subcommand === 'collectall') {
      await handleKickCollectAll(interaction);
    }
  },
};

export default command;
