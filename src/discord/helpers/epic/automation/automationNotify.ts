/**
 * Automation DMs to the account owner (no developer mirror).
 */

import { type Client, type Message, type MessageCreateOptions } from 'discord.js';

/** Send an automation DM to the user. Throws if the DM cannot be delivered (e.g. DMs closed). */
export async function sendAutomationUserDm(
  client: Client,
  discordId: string,
  options: MessageCreateOptions,
): Promise<Message> {
  const user = await client.users.fetch(discordId);
  return user.send(options);
}
