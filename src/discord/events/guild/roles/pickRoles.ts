import {
  Events,
  GuildMember,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { SERVER_CONFIG, SELF_ROLE_SELECT_ID } from '../config/serverConfig.ts';
import { log } from '#helpers/core/logger.ts';
import { buildGatewayEmbed } from '#helpers/core/client/gatewayMessageHelper.ts';
import { syncMemberSelfRoles } from '#helpers/discord/guild/selfRolesPanelBuilder.ts';

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,

  async execute(client: ExtendedClient, interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== SELF_ROLE_SELECT_ID) return;

    await handleSelfRoleSelect(interaction, client);
  },
};

async function handleSelfRoleSelect(interaction: StringSelectMenuInteraction, client: ExtendedClient): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    const embed = await buildGatewayEmbed(client, interaction.user.id, interaction.locale, 'error', {
      emojiKey: 'importante',
      titleKey: 'gateway.errorTitle',
      bodyKey: 'gateway.errors.membership.description',
      solutionKey: 'gateway.errors.membership.solution',
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (interaction.guildId !== SERVER_CONFIG.GUILD_ID) {
    await interaction.reply({ content: 'This panel is not available here.', ephemeral: true });
    return;
  }

  try {
    await syncMemberSelfRoles(member, interaction.values);
    await interaction.deferUpdate();
  } catch (err) {
    log.events.error({ err, userId: interaction.user.id }, '[SELF_ROLES] Failed to sync roles');
    const message = 'Could not update your roles. Make sure the bot has the necessary permissions.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
}

export default event;
