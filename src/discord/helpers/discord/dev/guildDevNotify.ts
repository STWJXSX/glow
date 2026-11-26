import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type Guild,
  type Client,
} from 'discord.js';
import { getDeveloperIds } from './devAuth.ts';

async function notifyDevelopers(client: Client, embed: EmbedBuilder, components?: ActionRowBuilder<ButtonBuilder>[]) {
  for (const devId of getDeveloperIds()) {
    try {
      const user = await client.users.fetch(devId);
      await user.send({
        embeds: [embed],
        components: components ?? [],
      });
    } catch (err) {
      console.warn(`[DEV-NOTIFY] Could not DM dev ${devId}:`, err instanceof Error ? err.message : err);
    }
  }
}

export async function notifyDevGuildJoin(client: Client, guild: Guild): Promise<void> {
  if (getDeveloperIds().length === 0) return;

  let inviteURL: string | null = null;
  const channel = guild.channels.cache.find((c) =>
    c.isTextBased() && c.permissionsFor(guild.members.me!)?.has('CreateInstantInvite'),
  );

  if (channel && 'createInvite' in channel) {
    try {
      inviteURL = (await channel.createInvite({ maxAge: 0, maxUses: 0 })).url;
    } catch { /* ignore */ }
  }

  const embed = new EmbedBuilder()
    .setTitle('New server joined')
    .setDescription(
      `**Server:** ${guild.name}\n**ID:** \`${guild.id}\`\n**Members:** ${guild.memberCount.toLocaleString()}`,
    )
    .setColor(0x00ae86)
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (inviteURL) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Invite').setStyle(ButtonStyle.Link).setURL(inviteURL),
      ),
    );
  }

  await notifyDevelopers(client, embed, components);
}

export async function notifyDevGuildLeave(client: Client, guild: Guild): Promise<void> {
  if (getDeveloperIds().length === 0) return;

  const embed = new EmbedBuilder()
    .setTitle('Bot removed from server')
    .setDescription(
      `**Server:** ${guild.name}\n**ID:** \`${guild.id}\`\n**Members:** ${guild.memberCount.toLocaleString()}`,
    )
    .setColor(0xff0000)
    .setTimestamp();

  await notifyDevelopers(client, embed);
}
