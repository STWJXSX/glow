import type { ChatInputCommandInteraction } from 'discord.js';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  type EpicEmbedInput,
} from '../epicEmbedHelper.ts';

/** Short success body for /fake — no ghostequip team-visibility footer text. */
export async function fakeSuccessDescription(
  userId: string,
  descriptionKey: string,
  vars?: Record<string, string>,
  locale?: string,
): Promise<string> {
  return translateForUser(userId, descriptionKey, vars, locale);
}

export async function editFakeReply(
  interaction: ChatInputCommandInteraction,
  userId: string,
  input: EpicEmbedInput,
): Promise<void> {
  const payload = await buildEpicReplyPayload(userId, input, interaction, interaction.locale);
  await interaction.editReply({
    content: null,
    embeds: payload.embeds,
    files: payload.files.length ? payload.files : [],
    components: [],
  });
}
