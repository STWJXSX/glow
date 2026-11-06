/**
 * /autotaxi
 *
 * Connects XMPP for 1 minute and waits for a party invite.
 * When a PING arrives, joins the party applying:
 *  - Ghost equip skin
 *  - STATS_ALTAS (high STW stats)
 *  - POWER_HIGH (CampaignCommanderLoadoutRating + CampaignBackpackRating)
 *
 * No DB persistence — ephemeral, per-activation only.
 */

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicApiError,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { editReplyInactive } from '#helpers/commands/epic/epicCollectorHelper.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';

const WAIT_MS = 60_000; // 1 minute

interface AutotaxiResult {
  joined: boolean;
  pingerDn?: string;
  senderId?: string;
  cancelled?: boolean;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autotaxi')
    .setDescription('Wait 1 minute for a party invite and auto-join with high stats')
    .setNameLocalizations(buildDiscordLocalizations('autotaxi.cmd.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autotaxi.cmd._1'))
    .setDMPermission(true) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const client = interaction.client;

    try {
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user?.deviceAuths?.length) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }
      const mainAccount = user.deviceAuths.find((a: any) => a.cuentaMain);
      if (!mainAccount) {
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const { accountId, displayName } = mainAccount;
      const currentDisplayName = mainAccount.displayName || displayName;

      const author = await getEpicAuthor(userId);
      const endTime = Math.floor((Date.now() + WAIT_MS) / 1000);

      const waitingPayload = await buildEpicReplyPayload(userId, {
        style: 'info',
        title: await translateEpic(client, userId, 'epic.loading', 'loading'),
        description: [
          await translateForUser(userId, 'unirse.waiting.description', { displayName: currentDisplayName }, interaction.locale),
          `<t:${endTime}:R>`,
        ].join('\n'),
        author,
      }, interaction);

      await interaction.editReply(waitingPayload);

      const result = await callCoreWithTimeout<AutotaxiResult>('autotaxi.start', WAIT_MS + 10_000, {
        discordId: userId,
        accountId,
        accessToken: mainAccount.accessToken,
        displayName: currentDisplayName,
      });

      if (result?.joined) {
        const payload = await buildEpicReplyPayload(userId, {
          style: 'success',
          title: await translateEpic(client, userId, 'unirse.success.title', 'success'),
          description: `**${currentDisplayName}** → \`${result.pingerDn ?? result.senderId}\``,
          author,
        }, interaction);
        await interaction.editReply(payload).catch(() => {});
        return;
      }

      const inactive = await translateForUser(userId, 'epic.inactiveNav', undefined, interaction.locale);
      await editReplyInactive(interaction, inactive);
    } catch (error: any) {
      log.epic.error({ error: error.message }, '[AUTOTAXI] Command error');
      await replyEpicApiError(interaction, userId, error);
    }
  },

  auth: true,
  premUltimate: true,
  nodefer: false,
};

export default command;
