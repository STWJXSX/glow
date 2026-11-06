/**
 * TICKET MESSAGE LOGGER
 * Listens to messages in open ticket channels and stores them in the DB
 * for transcript generation.
 */

import { Events, Message } from 'discord.js';
import Ticket from '#models/Ticket.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';

const event: BotEvent<'messageCreate'> = {
  name: Events.MessageCreate,
  once: false,

  async execute(_client: ExtendedClient, message: Message) {
    // Ignore DMs, bots (except for the welcome message context), and system messages
    if (!message.guild || message.author.bot || message.system) return;

    // Quick check: only process if channel is a ticket
    const ticket = await Ticket.findOne({ channelId: message.channelId, status: 'open' });
    if (!ticket) return;

    // Push message to the ticket
    ticket.messages.push({
      authorId: message.author.id,
      authorTag: message.author.tag,
      authorAvatar: message.author.displayAvatarURL({ size: 64 }),
      content: message.content || '',
      timestamp: new Date(),
      attachments: message.attachments.map(a => a.url),
    });

    await ticket.save();
  },
};

export default event;
