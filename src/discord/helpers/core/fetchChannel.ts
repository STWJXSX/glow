/**
 * Channel lookup that also works on a gateway-less client (the core).
 *
 * discord.js only builds a guild channel when its guild is cached, so channels.fetch() answers
 * null on a client that has no guild cache. The guild id is read over REST and the guild is
 * cached first.
 */

import { Routes } from 'discord.js';
import type { ExtendedClient } from '#structures/types.ts';

export async function fetchChannelWithGuild(client: ExtendedClient, channelId: string) {
  if (!client.channels.cache.has(channelId)) {
    const raw = await client.rest.get(Routes.channel(channelId)).catch(() => null) as { guild_id?: string } | null;
    if (raw?.guild_id && !client.guilds.cache.has(raw.guild_id)) {
      await client.guilds.fetch({ guild: raw.guild_id }).catch(() => null);
    }
  }
  return client.channels.fetch(channelId).catch(() => null);
}
