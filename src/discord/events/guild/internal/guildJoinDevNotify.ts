import { Events } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { notifyDevGuildJoin } from '#helpers/discord/dev/guildDevNotify.ts';

const event: BotEvent<'guildCreate'> = {
  name: Events.GuildCreate,
  once: false,

  async execute(client: ExtendedClient, guild) {
    await notifyDevGuildJoin(client, guild);
  },
};

export default event;
