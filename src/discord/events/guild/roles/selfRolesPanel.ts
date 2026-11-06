import { Events, type TextChannel } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { SERVER_CONFIG } from '../config/serverConfig.ts';
import { log } from '#helpers/core/logger.ts';
import {
  buildSelfRolesEmbed,
  buildSelfRoleSelectRow,
} from '#helpers/discord/guild/selfRolesPanelBuilder.ts';

async function ensureSelfRolesPanel(client: ExtendedClient): Promise<void> {
  const guild = client.guilds.cache.get(SERVER_CONFIG.GUILD_ID);
  if (!guild || !client.user) return;

  const channel = guild.channels.cache.get(SERVER_CONFIG.ROLES_CHANNEL_ID) as TextChannel | undefined;
  if (!channel?.isTextBased()) {
    log.events.warn('[SELF_ROLES] Roles channel not found or not text-based');
    return;
  }

  const embed = buildSelfRolesEmbed(client);
  const components = [buildSelfRoleSelectRow()];

  const fetched = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!fetched) return;

  const botMessages = [...fetched.values()]
    .filter((msg) => msg.author.id === client.user!.id)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const isRolePanelMessage = (msg: (typeof botMessages)[number]) =>
    msg.embeds.some((embed) => embed.author?.name === 'Glow Self Roles')
    || msg.components.some((row) =>
      'components' in row
      && row.components.some((comp) => 'customId' in comp && comp.customId === 'glow_self_roles'),
    );

  const panelMessage = botMessages.find(isRolePanelMessage);

  if (panelMessage) {
    await panelMessage.edit({ embeds: [embed], components }).catch((err) => {
      log.events.error({ err }, '[SELF_ROLES] Failed to update panel');
    });
    log.events.info('[SELF_ROLES] Panel up to date');
    return;
  }

  for (const msg of botMessages.filter(isRolePanelMessage)) {
    await msg.delete().catch(() => {});
  }

  await channel.send({ embeds: [embed], components }).catch((err) => {
    log.events.error({ err }, '[SELF_ROLES] Failed to send panel');
  });
  log.events.info('[SELF_ROLES] Panel created');
}

const event: BotEvent<'ready'> = {
  name: 'ready',
  once: true,

  async execute(client: ExtendedClient) {
    setTimeout(() => {
      ensureSelfRolesPanel(client).catch((err) => {
        log.events.error({ err }, '[SELF_ROLES] Failed to ensure panel');
      });
    }, 10_000);
  },
};

export default event;
