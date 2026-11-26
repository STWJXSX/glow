import { ChatInputCommandInteraction } from 'discord.js';
import { translateForUser } from '#helpers/locales/index.ts';
import type { MissionKickResult } from './types.ts';
import { replyWithEpicEmbed, translateEpic } from '../epicEmbedHelper.ts';

/** Respuesta de error de un mission kick (base, sin bot amigo, bots ocupados, fallo). */
export async function replyMissionKickFailure(
  interaction: ChatInputCommandInteraction,
  userId: string,
  result: Extract<MissionKickResult, { ok: false }>,
): Promise<void> {
  const key = {
    outpost: 'outpost',
    lobby: 'lobby',
    not_in_mission: 'notInMission',
    party_mates: 'partyMates',
    no_bots: 'noBots',
    not_friends: 'notFriends',
    busy: 'busy',
    error: 'failed',
  }[result.reason];
  const style = result.reason === 'error' ? 'error' : 'warning';

  await replyWithEpicEmbed(interaction, userId, {
    style,
    title: await translateEpic(interaction.client, userId, `party.kick.mission.${key}.title`, style),
    description: await translateForUser(userId, `party.kick.mission.${key}.description`, {
      bots: (result.botNames ?? []).map((n) => `\`${n}\``).join(', ') || '-',
    }, interaction.locale),
  });
}
