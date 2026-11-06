/**
 * COMANDO /fastswap
 * Automatic hero loadout swap during a STW mission.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { Command, ExtendedClient } from '#structures/types.ts';
import {
  buildEpicEmbed,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  getEpicAuthor,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import {
  cancelFastSwapRestoreWatch,
  startFastSwapRestoreWatch,
} from '#helpers/commands/stw/fastswapWatch.ts';
import type { FastSwapActionResult, FastSwapErrorCode } from '#helpers/commands/stw/fastswapTypes.ts';

const SESSION_STALE_MS = 90_000;

function fastSwapErrorKeys(code: FastSwapErrorCode): { titleKey: string; descriptionKey: string } {
  switch (code) {
    case 'NO_LOADOUT':
      return {
        titleKey: 'fastswap.errors.noLoadouts.title',
        descriptionKey: 'fastswap.errors.noLoadouts.description',
      };
    case 'NO_HEROES':
      return {
        titleKey: 'fastswap.errors.noHeroes.title',
        descriptionKey: 'fastswap.errors.noHeroes.description',
      };
    case 'LEADER_SWAP_FAILED':
      return {
        titleKey: 'fastswap.errors.leaderFailed.title',
        descriptionKey: 'fastswap.errors.leaderFailed.description',
      };
    default:
      return {
        titleKey: 'fastswap.errors.failed.title',
        descriptionKey: 'fastswap.errors.failed.description',
      };
  }
}

function endSession(client: ExtendedClient, sessionKey: string): void {
  client.commandSessions?.delete(sessionKey);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('fastswap')
    .setDescription('Swap hero loadout during a STW mission')
    .setNameLocalizations(buildDiscordLocalizations('fastswap.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('fastswap.cmd.description'))
    .addBooleanOption((opt) =>
      opt
        .setName('leader-only')
        .setDescription('Test: only swap commander on another loadout')
        .setNameLocalizations(buildDiscordLocalizations('fastswap.cmd.options.leaderOnly.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('fastswap.cmd.options.leaderOnly.description'))
        .setRequired(false),
    ) as unknown as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as ExtendedClient;
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const sessionKey = `fastswap_${userId}`;
    const leaderOnly = interaction.options.getBoolean('leader-only') ?? false;

    if (!interaction.replied && !interaction.deferred) {
      log.epic.warn('[fastswap] Interacción no replied/deferred — descartando');
      return;
    }

    const existingSession = client.commandSessions?.get(sessionKey);
    if (existingSession && Date.now() - existingSession.startTime <= SESSION_STALE_MS) {
      const linkText = existingSession.messageUrl
        ? `\n[Ver panel activo](${existingSession.messageUrl})`
        : '';
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title: await translateEpic(client, userId, 'fastswap.errors.alreadyRunning.title', 'error', undefined, locale),
        description: `${await translateForUser(userId, 'fastswap.errors.alreadyRunning.description', {
          url: existingSession.messageUrl || '—',
        }, locale)}${linkText}`,
        footerKey: 'brand',
      }, { ephemeral: false });
      return;
    }

    client.commandSessions?.set(sessionKey, {
      commandName: 'fastswap',
      userId,
      messageUrl: '',
      startTime: Date.now(),
    });

    const lang = (await getUserLanguage(userId, locale)) as SupportedLanguage;

    try {
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        endSession(client, sessionKey);
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
      if (!mainAccount) {
        endSession(client, sessionKey);
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const accountId = mainAccount.accountId;
      let accessToken = mainAccount.accessToken;
      const displayName = mainAccount.displayName;
      const authorData = await getEpicAuthor(userId, { accountId, accessToken, displayName });

      if (!leaderOnly) {
        const mission = await callCore<{ inMission: boolean; accessToken: string }>('fastswap.resolveMission', {
          userId,
          accountId,
          accessToken,
        });
        accessToken = mission.accessToken;

        if (!mission.inMission) {
          endSession(client, sessionKey);
          await interaction.editReply({
            embeds: [(await buildEpicEmbed(userId, {
              style: 'error',
              title: await translateEpic(client, userId, 'fastswap.errors.notInMission.title', 'error', undefined, locale),
              description: await translateForUser(userId, 'fastswap.errors.notInMission.description', undefined, locale),
              author: authorData,
              footerKey: 'brand',
            }, interaction, locale))],
          });
          return;
        }
      }

      const applyingKey = leaderOnly
        ? 'fastswap.applying.leaderOnly'
        : 'fastswap.applying.description';

      await interaction.editReply({
        embeds: [(await buildEpicEmbed(userId, {
          style: 'info',
          title: await translateEpic(client, userId, 'fastswap.applying.title', 'cargando', undefined, locale),
          description: await translateForUser(userId, applyingKey, undefined, locale),
          author: authorData,
          footerKey: 'brand',
          loading: true,
        }, interaction, locale))],
      });

      const result = leaderOnly
        ? await callCoreWithTimeout<FastSwapActionResult>('fastswap.executeLeaderOnly', 10 * 60_000, {
            accountId,
            accessToken,
            lang,
          })
        : await callCoreWithTimeout<FastSwapActionResult>('fastswap.executeAuto', 10 * 60_000, {
            accountId,
            accessToken,
            lang,
          });

      if (!result.ok) {
        const { titleKey, descriptionKey } = fastSwapErrorKeys(result.code);
        log.commands.error({ error: result.code, userId }, '[fastswap] failed');
        await interaction.editReply({
          embeds: [(await buildEpicEmbed(userId, {
            style: 'error',
            title: await translateEpic(client, userId, titleKey, 'error', undefined, locale),
            description: await translateForUser(userId, descriptionKey, undefined, locale),
            footerKey: 'brand',
          }, interaction, locale))],
        }).catch(() => {});
        return;
      }

      const loadoutLabel = `#${result.loadout.index} ${result.loadout.commanderDisplayName}`;
      const successKey = leaderOnly
        ? 'fastswap.success.leaderOnly'
        : 'fastswap.success.description';

      const reply = await interaction.fetchReply();
      client.commandSessions?.set(sessionKey, {
        commandName: 'fastswap',
        userId,
        messageUrl: reply.url,
        startTime: Date.now(),
      });

      await interaction.editReply({
        embeds: [(await buildEpicEmbed(userId, {
          style: 'success',
          title: await translateEpic(client, userId, 'fastswap.success.title', 'success', undefined, locale),
          description: await translateForUser(userId, successKey, {
            loadout: loadoutLabel,
            minutes: String(result.restoreMinutes),
          }, locale),
          author: authorData,
          footerKey: 'brand',
        }, interaction, locale))],
      });

      startFastSwapRestoreWatch({
        userId,
        accountId,
        lang,
        snapshots: result.restoreSnapshots,
        onRestored: async () => {
          await interaction.editReply({
            embeds: [(await buildEpicEmbed(userId, {
              style: 'success',
              title: await translateEpic(client, userId, 'fastswap.success.restoredTitle', 'success', undefined, locale),
              description: await translateForUser(userId, 'fastswap.success.restored', undefined, locale),
              author: authorData,
              footerKey: 'brand',
            }, interaction, locale))],
          }).catch(() => {});
        },
      });
    } catch (error: any) {
      cancelFastSwapRestoreWatch(userId);
      log.commands.error({ error: error.message, userId }, '[fastswap] failed');

      await interaction.editReply({
        embeds: [(await buildEpicEmbed(userId, {
          style: 'error',
          title: await translateEpic(client, userId, 'fastswap.errors.failed.title', 'error', undefined, locale),
          description: await translateForUser(userId, 'fastswap.errors.failed.description', undefined, locale),
          footerKey: 'brand',
        }, interaction, locale))],
      }).catch(() => {});
    } finally {
      endSession(client, sessionKey);
    }
  },
};

export default command;
