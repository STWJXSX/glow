/**
 * COMANDO /PARTY
 * Comandos relacionados con el grupo de Fortnite
 *
 * Subcomandos:
 * - invite: Invita a un jugador a tu party
 * - join: Solicita unirte al grupo de un jugador
 * - privacy: Alterna la privacidad del grupo
 * - promote: Asciende a un miembro del grupo a líder
 * - cloudgaming: Arregla el grupo bugueado por invitaciones
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { checkCommandPremiumRequirements } from '#helpers/core/client/premium.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import {
  replyWithEpicEmbed,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { handleInviteSubcommand } from '#helpers/commands/epic/party/invite.ts';
import { handleJoinSubcommand } from '#helpers/commands/epic/party/join.ts';
import { handlePrivacySubcommand } from '#helpers/commands/epic/party/privacy.ts';
import { handlePromoteSubcommand } from '#helpers/commands/epic/party/promote.ts';
import { handleCloudGamingSubcommand } from '#helpers/commands/epic/party/cloudgaming.ts';
import { handlePartyPanelSubcommand } from '#helpers/commands/epic/party/panel.ts';

async function replyPremiumRequired(
  interaction: ChatInputCommandInteraction,
  reason: string,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const errorMsg = await translateForUser(userId, `errors.${reason}`, undefined, interaction.locale);
  const title = await translateEpic(client, userId, 'premium.title', 'premium', undefined, interaction.locale);
  const getAccess = await translateForUser(userId, 'premium.getAccess', undefined, interaction.locale);
  const infoLink = await translateForUser(userId, 'premium.infoLink', undefined, interaction.locale);
  const supportText = await translateForUser(userId, 'premium.supportText', undefined, interaction.locale);

  await replyWithEpicEmbed(interaction, userId, {
    style: 'warning',
    title,
    description: [errorMsg, '', getAccess, `> ${infoLink}`, '', supportText].join('\n'),
  });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('party')
    .setDescription('Commands related to your Fortnite party')
    .setNameLocalizations(buildDiscordLocalizations('party.cmd.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._1'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('invite')
        .setDescription('Invite a player to your Fortnite party')
        .setNameLocalizations(buildDiscordLocalizations('party.cmd.invite.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._2'))
        .addStringOption((option) =>
          option
            .setName('user')
            .setDescription('The user to invite to your party')
            .setNameLocalizations(buildDiscordLocalizations('party.cmd.options.user.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._3'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('join')
        .setDescription('Request to join a player\'s party')
        .setNameLocalizations(buildDiscordLocalizations('party.cmd.join.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._4'))
        .addStringOption((option) =>
          option
            .setName('user')
            .setDescription('The player whose party you want to join')
            .setNameLocalizations(buildDiscordLocalizations('party.cmd.options.user.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._5'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('privacy')
        .setDescription('Toggle party privacy between public and private')
        .setNameLocalizations(buildDiscordLocalizations('party.cmd.privacy.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._6')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('promote')
        .setDescription('Promote a party member to leader')
        .setNameLocalizations(buildDiscordLocalizations('party.cmd.promote.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._7'))
        .addStringOption((option) =>
          option
            .setName('member')
            .setDescription('Party member to promote to leader')
            .setNameLocalizations(buildDiscordLocalizations('party.cmd.options.member.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._8'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Open a panel to manage your current party')
        .setNameLocalizations(buildDiscordLocalizations('party.cmd.panel.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._9')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cloudgaming')
        .setDescription('Fix party invites and joins')
        .setNameLocalizations(buildDiscordLocalizations('party.cmd.cloudgaming.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('party.cmd._10')),
    ) as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 5,

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'invite':
      case 'join':
        await handleInviteSubcommand(interaction, true);
        break;
      case 'promote':
        await handlePromoteSubcommand(interaction, true);
        break;
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'invite': {
        const premResult = await checkCommandPremiumRequirements(
          { prem: true } as Command,
          interaction.user.id,
          interaction.guildId,
          interaction.client,
        );
        if (!premResult.allowed) {
          await replyPremiumRequired(interaction, premResult.reason!);
          return;
        }
        await handleInviteSubcommand(interaction);
        break;
      }
      case 'join': {
        const premResult = await checkCommandPremiumRequirements(
          { prem: true } as Command,
          interaction.user.id,
          interaction.guildId,
          interaction.client,
        );
        if (!premResult.allowed) {
          await replyPremiumRequired(interaction, premResult.reason!);
          return;
        }
        await handleJoinSubcommand(interaction);
        break;
      }
      case 'privacy':
        await handlePrivacySubcommand(interaction);
        break;
      case 'promote':
        await handlePromoteSubcommand(interaction);
        break;
      case 'panel':
        await handlePartyPanelSubcommand(interaction);
        break;
      case 'cloudgaming':
        await handleCloudGamingSubcommand(interaction);
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
};

export default command;
