/**
 * COMANDO /DUPE
 * Ejecuta dupe automático en Save the World
 * Sistema de sesiones: No permite ejecutar múltiples dupes simultáneos
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import type { Command, ExtendedClient } from '#structures/types.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  buildEpicReplyPayload,
  getEpicAuthor,
  translateEpic,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

type DupeResultStatus = 'success' | 'failed' | 'notInGame' | 'notInBase' | 'notBugged' | 'waiting';

interface DupeRunResult {
  status: DupeResultStatus;
  footer?: 'buggedWithStorage' | 'buggedWithoutStorage' | null;
  waitMs?: number;
  lockExpiration?: string;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('dupe')
    .setDescription('Attempts to perform dupe in lobby')
    .setNameLocalizations(buildDiscordLocalizations('dupe.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('dupe.cmd.description'))
    .setDMPermission(true)
    .setDefaultMemberPermissions(null)
    .addBooleanOption((opt) =>
      opt
        .setName('force')
        .setDescription('Skip the in-match check and run dupe anyway')
        .setNameLocalizations(buildDiscordLocalizations('dupe.cmd.options.force.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('dupe.cmd.options.force.description'))
        .setRequired(false),
    ),

  auth: true,
  nodefer: false,
  cooldown: 1,

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as ExtendedClient;
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const force = interaction.options.getBoolean('force') ?? false;

    if (!interaction.replied && !interaction.deferred) {
      log.epic.warn('[dupe] Interacción no replied/deferred — descartando ejecución fantasma');
      return;
    }

    const sessionKey = `dupe_${userId}`;
    if (client.commandSessions?.has(sessionKey)) {
      const existingSession = client.commandSessions.get(sessionKey)!;
      const linkText = existingSession.messageUrl
        ? ` [Ver mensaje activo](${existingSession.messageUrl})`
        : '';
      const base = await translateForUser(userId, 'dupe.errors.alreadyRunning.description', undefined, locale);
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title: await translateForUser(userId, 'dupe.errors.alreadyRunning.title', undefined, locale),
        description: `${base}${linkText}`,
        footerKey: 'brand',
      }).catch(() => {});
      return;
    }

    client.commandSessions?.set(sessionKey, {
      commandName: 'dupe',
      userId,
      messageUrl: '',
      startTime: Date.now(),
    });

    const trans = {
      success: {
        title: await translateForUser(userId, 'dupe.success.title', undefined, locale),
        description: await translateForUser(userId, 'dupe.success.description', undefined, locale),
      },
      warnings: {
        notInGame: {
          title: await translateForUser(userId, 'dupe.warnings.notInGame.title', undefined, locale),
          description: await translateForUser(userId, 'dupe.warnings.notInGame.description', undefined, locale),
        },
        notInBase: {
          title: await translateForUser(userId, 'dupe.warnings.notInBase.title', undefined, locale),
          description: await translateForUser(userId, 'dupe.warnings.notInBase.description', undefined, locale),
        },
      },
      errors: {
        notBugged: {
          title: await translateForUser(userId, 'dupe.errors.notBugged.title', undefined, locale),
          description: await translateForUser(userId, 'dupe.errors.notBugged.description', undefined, locale),
        },
        failed: {
          title: await translateForUser(userId, 'dupe.errors.failed.title', undefined, locale),
          description: await translateForUser(userId, 'dupe.errors.failed.description', undefined, locale),
        },
      },
      status: {
        buggedWithStorage: await translateForUser(userId, 'dupe.status.buggedWithStorage', undefined, locale),
        buggedWithoutStorage: await translateForUser(userId, 'dupe.status.buggedWithoutStorage', undefined, locale),
      },
      waiting: {
        description: await translateEpic(client, userId, 'dupe.waiting.description', 'cargando', undefined, locale),
      },
    };

    try {
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        client.commandSessions?.delete(sessionKey);
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
      if (!mainAccount) {
        client.commandSessions?.delete(sessionKey);
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const accountId = mainAccount.accountId;
      const accessToken = mainAccount.accessToken;
      const displayName = mainAccount.displayName;

      const authorData = await getEpicAuthor(userId, { accountId, accessToken, displayName });

      async function buildSuccessPayload(footer: DupeRunResult['footer']) {
        const footerText = footer === 'buggedWithStorage'
          ? trans.status.buggedWithStorage
          : footer === 'buggedWithoutStorage'
            ? trans.status.buggedWithoutStorage
            : undefined;

        return buildEpicReplyPayload(userId, {
          style: 'success',
          title: trans.success.title,
          description: trans.success.description.replace('{account}', displayName),
          author: authorData,
          footerText,
          footerKey: footerText ? 'none' : 'brand',
        }, interaction, locale);
      }

      async function buildErrorPayload(title: string, description: string) {
        return buildEpicReplyPayload(userId, {
          style: 'error',
          title,
          description,
          author: authorData,
          footerKey: 'brand',
        }, interaction, locale);
      }

      async function buildWarningPayload(title: string, description: string) {
        return buildEpicReplyPayload(userId, {
          style: 'warning',
          title,
          description,
          author: authorData,
          footerKey: 'brand',
        }, interaction, locale);
      }

      const reply = await interaction.fetchReply() as Message;
      client.commandSessions?.set(sessionKey, {
        commandName: 'dupe',
        userId,
        messageUrl: reply.url,
        startTime: Date.now(),
      });

      log.epic.info(`Intentando dupe directo para ${displayName}${force ? ' (force)' : ''}...`);

      const result = await callCoreWithTimeout<DupeRunResult>('dupe.run', 5 * 60_000, {
        accountId,
        accessToken,
        force,
      });

      switch (result.status) {
        case 'notInGame': {
          client.commandSessions?.delete(sessionKey);
          const payload = await buildWarningPayload(
            trans.warnings.notInGame.title,
            trans.warnings.notInGame.description,
          );
          await interaction.editReply(payload);
          return;
        }

        case 'notInBase': {
          client.commandSessions?.delete(sessionKey);
          const payload = await buildWarningPayload(
            trans.warnings.notInBase.title,
            trans.warnings.notInBase.description,
          );
          await interaction.editReply(payload);
          return;
        }

        case 'notBugged': {
          client.commandSessions?.delete(sessionKey);
          const payload = await buildErrorPayload(trans.errors.notBugged.title, trans.errors.notBugged.description);
          await interaction.editReply(payload);
          return;
        }

        case 'failed': {
          client.commandSessions?.delete(sessionKey);
          const payload = await buildErrorPayload(trans.errors.failed.title, trans.errors.failed.description);
          await interaction.editReply(payload);
          return;
        }

        case 'success': {
          client.commandSessions?.delete(sessionKey);
          await interaction.editReply(await buildSuccessPayload(result.footer));
          return;
        }

        case 'waiting': {
          const waitMs = result.waitMs ?? 0;
          const lockExpirationUtc = result.lockExpiration
            ? new Date(result.lockExpiration)
            : new Date(Date.now() + waitMs);
          const relativeTime = `<t:${Math.floor(lockExpirationUtc.getTime() / 1000)}:R>`;
          const waitingPayload = await buildEpicReplyPayload(userId, {
            style: 'info',
            description: trans.waiting.description.replace('{time}', relativeTime),
            author: authorData,
            loading: true,
            footerKey: 'brand',
          }, interaction, locale);

          await interaction.editReply(waitingPayload);

          setTimeout(async () => {
            try {
              const finalResult = await callCoreWithTimeout<DupeRunResult>('dupe.finish', 2 * 60_000, {
                accountId,
                accessToken,
              });
              client.commandSessions?.delete(sessionKey);

              const payload = finalResult.status === 'success'
                ? await buildSuccessPayload(finalResult.footer)
                : await buildErrorPayload(trans.errors.failed.title, trans.errors.failed.description);

              await interaction.editReply(payload).catch(err => {
                log.epic.error({ err }, 'Error editando respuesta final de dupe');
              });
            } catch (error) {
              client.commandSessions?.delete(sessionKey);
              log.epic.error({ error }, 'Error editando respuesta final de dupe');
              const payload = await buildErrorPayload(trans.errors.failed.title, trans.errors.failed.description);
              await interaction.editReply(payload).catch(() => {});
            }
          }, waitMs);
          return;
        }
      }
    } catch (error) {
      client.commandSessions?.delete(sessionKey);
      log.epic.error({ error }, 'Error en comando dupe');

      if (interaction.replied || interaction.deferred) {
        await replyEpicCustomError(interaction, userId, 'dupe.errors.failed.description').catch(() => {});
      }
    }
  },
};

export default command;
