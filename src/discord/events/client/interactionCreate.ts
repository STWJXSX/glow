import { Events, ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { mainAccountGateFor } from '#helpers/core/client/auth.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { isBulkInteraction } from '#helpers/core/client/bulkAccess.ts';
import { checkBlacklist } from '#helpers/core/client/blacklistGate.ts';
import { checkCommandPremiumRequirements, resolvePremiumAccess } from '#helpers/core/client/premium.ts';
import { checkServerRequirement } from '#helpers/core/client/serverVerification.ts';
import { checkCooldown, handleCooldownResponse } from '#helpers/core/client/cooldown.ts';
import { isDeveloper, isBlacklistManager, getSupportServerId } from '#helpers/discord/dev/devAuth.ts';
import { sendDeferResponse, sendDeferEphemeralResponse, handleCommandError } from '#helpers/core/client/commandResponse.ts';
import {
  buildPremiumRequiredEmbed,
  replyGatewayEmbed,
} from '#helpers/core/client/gatewayMessageHelper.ts';
import { refreshMainAccountToken, refreshMainAccountTokenForUser } from '#helpers/epic/auth/tokenRefresh.ts';
import { translate, resolveLanguage } from '#helpers/locales/index.ts';
import { isMongoConnected } from '../db/mongodb.ts';
import { trackCommandUsage } from '#helpers/core/client/achievementTracker.ts';

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(client: ExtendedClient, interaction) {
    if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) {
      return;
    }

    const commandName = interaction.commandName;
    const command = client.commands.get(commandName);

    if (!command) {
      if (interaction.isChatInputCommand()) {
        await replyGatewayEmbed(interaction as ChatInputCommandInteraction, client, 'error', {
          emojiKey: 'importante',
          titleKey: 'gateway.commandNotFound.title',
          bodyKey: 'gateway.commandNotFound.description',
          solutionKey: 'gateway.commandNotFound.solution',
        }).catch(() => {});
      } else if (interaction.isAutocomplete()) {
        await interaction
          .respond([{ name: translate('gateway.autocomplete.unavailable', resolveLanguage(interaction.locale)), value: 'error' }])
          .catch(() => {});
      }
      return;
    }

    if (!isMongoConnected()) {
      if (interaction.isAutocomplete()) {
        // An empty list shows a blank box in Discord; say why instead.
        await interaction
          .respond([{ name: translate('gateway.autocomplete.starting', resolveLanguage(interaction.locale)), value: 'error' }])
          .catch(() => {});
      } else {
        await replyGatewayEmbed(interaction as ChatInputCommandInteraction, client, 'warning', {
          emojiKey: 'loading',
          titleKey: 'gateway.databaseStarting.title',
          bodyKey: 'gateway.databaseStarting.description',
          solutionKey: 'gateway.databaseStarting.solution',
        }).catch(() => {});
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      // Autocomplete must respond within 3s — refresh token in background, don't block.
      if (command.auth) {
        void refreshMainAccountToken(interaction.user.id).catch(() => {});
      }
      if (command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (err) {
          log.commands.error({ command: commandName, err }, 'Error en autocomplete');
          await interaction.respond([]).catch(() => {});
        }
      } else {
        await interaction.respond([]).catch(() => {});
      }
      return;
    }

    const chatInteraction = interaction as ChatInputCommandInteraction;
    const userId = chatInteraction.user.id;
    const guildId = chatInteraction.guildId;
    const startedAt = Date.now();

    // Dev-only gate is synchronous: answer it (ephemeral) before deferring.
    if (command.devOnly) {
      const supportGuildId = getSupportServerId();
      if (!supportGuildId || guildId !== supportGuildId) {
        await chatInteraction.reply({
          content: 'This command is only available in the official support server.',
          ephemeral: true,
        }).catch(() => {});
        return;
      }
      const allowed = command.devAccess === 'blacklist' ? isBlacklistManager(userId) : isDeveloper(userId);
      if (!allowed) {
        await chatInteraction.reply({
          content: 'This command is restricted to the bot developer.',
          ephemeral: true,
        }).catch(() => {});
        return;
      }
    }

    // inServer replies with its own ephemeral message, so it runs before the defer.
    if (command.inServer) {
      const serverResult = await checkServerRequirement(chatInteraction, commandName);
      if (!serverResult.allowed) {
        return;
      }
    }

    // Defer FIRST (Discord shows "thinking" at once); every check below runs after it.
    // `nodefer` commands (modals) must not be deferred.
    if (!command.nodefer) {
      if (command.deferEphemeral) {
        await sendDeferEphemeralResponse(chatInteraction, commandName, client);
      } else {
        await sendDeferResponse(chatInteraction, client, commandName);
      }
    }
    const deferredAt = Date.now();

    const blacklistResult = await checkBlacklist(chatInteraction);
    if (!blacklistResult.allowed) {
      await replyGatewayEmbed(chatInteraction, client, 'error', {
        emojiKey: 'importante',
        titleKey: 'gateway.accessDenied.title',
        bodyKey: 'errors.blacklisted',
      }).catch(() => {});
      return;
    }

    if (command.auth) {
      // One UsuarioInfo read shared by the TOS, account and token checks.
      const usuario = await UsuarioInfo.findOne({ id: userId });

      if (!usuario || usuario.aceptarTOS !== true) {
        await replyGatewayEmbed(chatInteraction, client, 'warning', {
          emojiKey: 'alert',
          titleKey: 'gateway.authRequired.title',
          bodyKey: 'gateway.authRequired.description',
          solutionKey: 'gateway.authRequired.solution',
        }).catch(() => {});
        return;
      }

      const bulkMode = isBulkInteraction(chatInteraction);

      if (bulkMode) {
        if (!usuario.deviceAuths?.length) {
          await replyGatewayEmbed(chatInteraction, client, 'warning', {
            emojiKey: 'alert',
            titleKey: 'gateway.authRequired.title',
            bodyKey: 'gateway.authRequired.description',
            solutionKey: 'gateway.authRequired.solution',
          }).catch(() => {});
          return;
        }
        log.epic.debug({ userId, command: commandName }, 'Bulk mode — skipping main-only token refresh');
      } else {
        const mainGate = mainAccountGateFor(usuario);
        if (mainGate.status === 'no_accounts') {
          await replyGatewayEmbed(chatInteraction, client, 'warning', {
            emojiKey: 'alert',
            titleKey: 'gateway.authRequired.title',
            bodyKey: 'gateway.authRequired.description',
            solutionKey: 'gateway.authRequired.solution',
          }).catch(() => {});
          return;
        }
        if (mainGate.status === 'no_main') {
          await replyGatewayEmbed(chatInteraction, client, 'info', {
            emojiKey: 'alert',
            titleKey: 'gateway.noMainAccount.title',
            bodyKey: 'gateway.noMainAccount.description',
            solutionKey: 'gateway.noMainAccount.solution',
          }).catch(() => {});
          return;
        }
        if (mainGate.status === 'auth_suspended') {
          // The flag can come from an outage or a race with another refresh, so it
          // must not block forever: only short-circuit when it was set moments ago,
          // otherwise try the refresh below (a success clears it).
          const main = usuario.deviceAuths.find((acc) => acc.cuentaMain);
          const suspendedAt = main?.automationSuspendedAt ? Date.parse(main.automationSuspendedAt) : NaN;
          const recentlyFailed = Number.isFinite(suspendedAt) && Date.now() - suspendedAt < 60_000;
          if (recentlyFailed) {
            await replyGatewayEmbed(chatInteraction, client, 'error', {
              emojiKey: 'alert',
              titleKey: 'gateway.sessionExpired.title',
              bodyKey: 'gateway.sessionExpired.description',
              solutionKey: 'gateway.sessionExpired.solution',
            }).catch(() => {});
            return;
          }
          log.epic.debug({ userId, command: commandName }, 'Suspended flag is stale — retrying token refresh');
        }

        const refreshResult = await refreshMainAccountTokenForUser(usuario, userId);
        if (!refreshResult.mainAccount) {
          if (refreshResult.error === 'no_main' || refreshResult.error === 'no_accounts') {
            await replyGatewayEmbed(chatInteraction, client, 'info', {
              emojiKey: 'alert',
              titleKey: 'gateway.noMainAccount.title',
              bodyKey: 'gateway.noMainAccount.description',
              solutionKey: 'gateway.noMainAccount.solution',
            }).catch(() => {});
            return;
          }

          if (refreshResult.error === 'networkError') {
            // Epic did not answer clearly — the session is still stored, so do not
            // tell the user to log in again.
            await replyGatewayEmbed(chatInteraction, client, 'warning', {
              emojiKey: 'alert',
              titleKey: 'gateway.epicUnavailable.title',
              bodyKey: 'gateway.epicUnavailable.description',
              solutionKey: 'gateway.epicUnavailable.solution',
            }).catch(() => {});
            return;
          }

          await replyGatewayEmbed(chatInteraction, client, 'error', {
            emojiKey: 'alert',
            titleKey: 'gateway.sessionExpired.title',
            bodyKey: 'gateway.sessionExpired.description',
            solutionKey: 'gateway.sessionExpired.solution',
          }).catch(() => {});
          return;
        }

        log.epic.debug({ userId, command: commandName }, 'Token verified/refreshed for auth command');
      }
    }

    const premiumResult = await checkCommandPremiumRequirements(
      command,
      userId,
      guildId,
      client,
    );

    if (!premiumResult.allowed) {
      const embed = await buildPremiumRequiredEmbed(client, chatInteraction, premiumResult.reason!);
      await chatInteraction.editReply({ content: null, embeds: [embed], components: [] }).catch(() => {});
      return;
    }

    const access = await resolvePremiumAccess(userId, client);
    const cooldownCheck = checkCooldown(client, command, chatInteraction, access.canUsePremiumCommands);

    if (!cooldownCheck.allowed) {
      await handleCooldownResponse(
        chatInteraction,
        client,
        commandName,
        cooldownCheck.remaining!,
        cooldownCheck.expiresAt,
      );
      return;
    }

    const checksDoneAt = Date.now();
    try {
      await command.execute(chatInteraction);
      const doneAt = Date.now();
      log.commands.info(
        {
          command: commandName,
          deferMs: deferredAt - startedAt,
          checksMs: checksDoneAt - deferredAt,
          execMs: doneAt - checksDoneAt,
          totalMs: doneAt - startedAt,
        },
        '[timing] Command handled',
      );

      // Sistema de logros: contar solo ejecuciones exitosas (fire-and-forget)
      trackCommandUsage(userId, commandName);

      log.commands.debug({ command: commandName, user: userId, guild: guildId }, 'Comando ejecutado');
    } catch (err) {
      await handleCommandError(chatInteraction, client, commandName, err);
    }
  },
};

export default event;
