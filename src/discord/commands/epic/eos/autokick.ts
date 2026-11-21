import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

import type { Command } from '#structures/types.ts';

import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';

import { replyWithEpicEmbed } from '#helpers/commands/epic/epicEmbedHelper.ts';

import { handleAutokickActivate } from '#helpers/commands/epic/party/autokickActivate.ts';

import { handleAutokickDeactivate } from '#helpers/commands/epic/party/autokickDeactivate.ts';

import { handleAutokickConfigure } from '#helpers/commands/epic/party/autokickConfigure.ts';



const command: Command = {

  data: new SlashCommandBuilder()

    .setName('autokick')

    .setDescription('AutoKick system for STW')

    .setNameLocalizations(buildDiscordLocalizations('autokick.cmd.name'))

    .setDescriptionLocalizations(buildDiscordLocalizations('autokick.cmd._1'))

    .addSubcommand((subcommand) =>

      subcommand

        .setName('activate')

        .setDescription('Activate AutoKick for your main account')

        .setNameLocalizations(buildDiscordLocalizations('autokick.cmd.activate.name'))

        .setDescriptionLocalizations(buildDiscordLocalizations('autokick.cmd._2')),

    )

    .addSubcommand((subcommand) =>

      subcommand

        .setName('deactivate')

        .setDescription('Deactivate AutoKick for your main account')

        .setNameLocalizations(buildDiscordLocalizations('autokick.cmd.deactivate.name'))

        .setDescriptionLocalizations(buildDiscordLocalizations('autokick.cmd._3')),

    )

    .addSubcommand((subcommand) =>

      subcommand

        .setName('configure')

        .setDescription('Configure AutoKick options')

        .setNameLocalizations(buildDiscordLocalizations('autokick.cmd.configure.name'))

        .setDescriptionLocalizations(buildDiscordLocalizations('autokick.cmd._4')),

    ) as SlashCommandBuilder,



  async execute(interaction: ChatInputCommandInteraction): Promise<void> {

    const subcommand = interaction.options.getSubcommand(true);



    switch (subcommand) {

      case 'activate':

      case 'activar':

        await handleAutokickActivate(interaction);

        break;



      case 'deactivate':

      case 'desactivar':

        await handleAutokickDeactivate(interaction);

        break;



      case 'configure':

      case 'configurar':

        await handleAutokickConfigure(interaction);

        break;



      default:

        await replyWithEpicEmbed(interaction, interaction.user.id, {

          style: 'error',

          description: await translateForUser(

            interaction.user.id,

            'common.commandNotFound',

            undefined,

            interaction.locale,

          ),

        });

    }

  },



  auth: true,

  inServer: false,

  automationSystem: 'autokick',

  nodefer: true,

};



export default command;

