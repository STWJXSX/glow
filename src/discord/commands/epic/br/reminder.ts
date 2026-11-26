import {

  SlashCommandBuilder,

  ChatInputCommandInteraction,

  AutocompleteInteraction,

} from 'discord.js';

import { buildDiscordLocalizations } from '#helpers/locales/index.ts';

import type { Command } from '#structures/types.ts';

import {

  handleReminderAdd,

  handleReminderDelete,

  handleReminderList,

  handleReminderAddAutocomplete,

  handleReminderDeleteAutocomplete,

} from '#helpers/commands/br/reminder/reminder.ts';



const command: Command = {

  data: new SlashCommandBuilder()

    .setName('reminder')

    .setDescription('Get notified when a cosmetic appears in the BR shop')

    .setNameLocalizations(buildDiscordLocalizations('reminder.cmd.name'))

    .setDescriptionLocalizations(buildDiscordLocalizations('reminder.cmd._1'))

    .addSubcommand(sub =>

      sub

        .setName('add')

        .setDescription('Add a cosmetic to your reminder list')

        .setNameLocalizations(buildDiscordLocalizations('reminder.cmd.add.name'))

        .setDescriptionLocalizations(buildDiscordLocalizations('reminder.cmd._2'))

        .addStringOption(opt =>

          opt

            .setName('item')

            .setDescription('Search for a BR cosmetic')

            .setNameLocalizations(buildDiscordLocalizations('reminder.cmd.options.item.name'))

            .setDescriptionLocalizations(buildDiscordLocalizations('reminder.cmd._3'))

            .setRequired(true)

            .setAutocomplete(true)

        )

    )

    .addSubcommand(sub =>

      sub

        .setName('delete')

        .setDescription('Remove a cosmetic from your reminder list')

        .setNameLocalizations(buildDiscordLocalizations('reminder.cmd.delete.name'))

        .setDescriptionLocalizations(buildDiscordLocalizations('reminder.cmd._4'))

        .addStringOption(opt =>

          opt

            .setName('item')

            .setDescription('Item to remove from your reminder list')

            .setNameLocalizations(buildDiscordLocalizations('reminder.cmd.options.item.name'))

            .setDescriptionLocalizations(buildDiscordLocalizations('reminder.cmd._5'))

            .setRequired(true)

            .setAutocomplete(true)

        )

    )

    .addSubcommand(sub =>

      sub

        .setName('list')

        .setDescription('Show all items on your reminder list')

        .setNameLocalizations(buildDiscordLocalizations('reminder.cmd.list.name'))

        .setDescriptionLocalizations(buildDiscordLocalizations('reminder.cmd._6'))

    ) as SlashCommandBuilder,



  auth: true,
  automationSystem: 'reminder',
  nodefer: false,



  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {

    const sub = interaction.options.getSubcommand(false);



    if (sub === 'add' || sub === 'agregar') {

      await handleReminderAddAutocomplete(interaction);

    } else if (sub === 'delete' || sub === 'eliminar') {

      await handleReminderDeleteAutocomplete(interaction);

    }

  },



  async execute(interaction: ChatInputCommandInteraction): Promise<void> {

    const sub = interaction.options.getSubcommand(true);



    switch (sub) {

      case 'add':

      case 'agregar':

        await handleReminderAdd(interaction);

        break;

      case 'delete':

      case 'eliminar':

        await handleReminderDelete(interaction);

        break;

      case 'list':

      case 'lista':

        await handleReminderList(interaction);

        break;

    }

  },

};



export default command;

