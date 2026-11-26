import { Events } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { notifyDevGuildLeave } from '#helpers/discord/dev/guildDevNotify.ts';

const event: BotEvent<'guildDelete'> = {
  name: Events.GuildDelete,
  once: false,

  async execute(client: ExtendedClient, guild) {
    await notifyDevGuildLeave(client, guild);
  },
};

export default event;
