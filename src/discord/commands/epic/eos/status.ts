import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, buildLocalizedChoices, translateForUser } from '#helpers/locales/index.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { StatusInfoResult } from '#helpers/commands/epic/status/types.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  getEpicAuthor,
  epicSection,
  epicQuote,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const PLATFORM_VALUES = ['WIN', 'AND', 'PSN', 'XBL', 'SWT', 'IOS', 'MAC'] as const;
const PRESENCE_VALUES = ['online', 'dnd', 'away'] as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Manage the status system in Fortnite')
    .setNameLocalizations(buildDiscordLocalizations('status.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._1'))
    .addSubcommand((sub) =>
      sub
        .setName('activate')
        .setDescription('Activate the status system in Fortnite')
        .setNameLocalizations(buildDiscordLocalizations('status.cmd.activate.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._2'))
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('The status message you want to show')
            .setNameLocalizations(buildDiscordLocalizations('status.cmd.options.message.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._3'))
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('platform')
            .setDescription('Platform for the status')
            .setNameLocalizations(buildDiscordLocalizations('status.cmd.options.platform.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._4'))
            .setRequired(false)
            .addChoices(
              ...buildLocalizedChoices(
                'status.platforms',
                PLATFORM_VALUES.map((value) => ({ value })),
              ),
            ),
        )
        .addStringOption((option) =>
          option
            .setName('presence')
            .setDescription('How you want to appear')
            .setNameLocalizations(buildDiscordLocalizations('status.cmd.options.presence.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._5'))
            .setRequired(false)
            .addChoices(
              ...buildLocalizedChoices(
                'status.presences',
                PRESENCE_VALUES.map((value) => ({ value })),
              ),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deactivate')
        .setDescription('Deactivate the status system in Fortnite')
        .setNameLocalizations(buildDiscordLocalizations('status.cmd.deactivate.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._6')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Show information about current status')
        .setNameLocalizations(buildDiscordLocalizations('status.cmd.info.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('status.cmd._7')),
    ),

  cooldown: 10,
  auth: true,
  automationSystem: 'status',

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const subcommand = interaction.options.getSubcommand();

    const user = await UsuarioInfo.findOne({ id: interaction.user.id });
    if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((d: any) => d.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    switch (subcommand) {
      case 'activate':
      case 'activar':
        await handleActivate(interaction, mainAccount, locale);
        break;
      case 'deactivate':
      case 'desactivar':
        await handleDeactivate(interaction, mainAccount, locale);
        break;
      case 'info':
        await handleInfo(interaction, mainAccount, locale);
        break;
      default:
        await replyWithEpicEmbed(interaction, userId, {
          style: 'error',
          description: epicQuote(await translateForUser(userId, 'common.commandNotFound', undefined, locale)),
          footerKey: 'brand',
        });
    }
  },
};

export default command;

async function platformLabel(
  userId: string,
  code: string,
  locale?: string | null,
): Promise<string> {
  return translateForUser(userId, `status.platforms.${code}`, undefined, locale);
}

async function presenceLabel(
  userId: string,
  mode: string,
  locale?: string | null,
): Promise<string> {
  return translateForUser(userId, `status.presences.${mode}`, undefined, locale);
}

async function handleActivate(
  interaction: ChatInputCommandInteraction,
  mainAccount: { accountId: string; displayName?: string; accessToken?: string },
  locale: string | null,
) {
  const userId = interaction.user.id;
  const mensaje = interaction.options.getString('message', true);
  const plataforma = interaction.options.getString('platform') || 'WIN';
  const presencia = interaction.options.getString('presence') || 'online';

  const authorData = await getEpicAuthor(userId, {
    accountId: mainAccount.accountId,
    accessToken: mainAccount.accessToken ?? '',
    displayName: mainAccount.displayName ?? mainAccount.accountId,
  });

  try {
    await callCoreWithTimeout('status.activate', 60_000, {
      userId,
      accountId: mainAccount.accountId,
      message: mensaje,
      platform: plataforma,
      presence: presencia,
    });

    const [title, description, messageLabel, platformFieldLabel, presenceFieldLabel, accountLabel, platformName, presenceName] = await Promise.all([
      translateForUser(userId, 'status.activar.embed.title', undefined, locale),
      translateForUser(userId, 'status.activar.embed.description', undefined, locale),
      translateForUser(userId, 'status.activar.embed.fields.message', undefined, locale),
      translateForUser(userId, 'status.activar.embed.fields.platform', undefined, locale),
      translateForUser(userId, 'status.activar.embed.fields.presence', undefined, locale),
      translateForUser(userId, 'status.activar.embed.fields.account', undefined, locale),
      platformLabel(userId, plataforma, locale),
      presenceLabel(userId, presencia, locale),
    ]);

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      title,
      description: epicQuote(description),
      fields: [
        { name: epicSection(messageLabel), value: `\`${mensaje}\``, inline: false },
        { name: epicSection(platformFieldLabel), value: platformName, inline: true },
        { name: epicSection(presenceFieldLabel), value: presenceName, inline: true },
        { name: epicSection(accountLabel), value: mainAccount.displayName || mainAccount.accountId, inline: true },
      ],
      author: authorData,
      footerKey: 'brand',
    });
  } catch (error: unknown) {
    log.commands.error({ error, userId }, '[STATUS] Error activando status');
    await replyEpicApiError(interaction, userId, error);
  }
}

async function handleDeactivate(
  interaction: ChatInputCommandInteraction,
  mainAccount: { accountId: string; displayName?: string; accessToken?: string },
  locale: string | null,
) {
  const userId = interaction.user.id;

  const authorData = await getEpicAuthor(userId, {
    accountId: mainAccount.accountId,
    accessToken: mainAccount.accessToken ?? '',
    displayName: mainAccount.displayName ?? mainAccount.accountId,
  });

  try {
    await callCoreWithTimeout('status.deactivate', 60_000, {
      userId,
      accountId: mainAccount.accountId,
    });

    const [title, description] = await Promise.all([
      translateForUser(userId, 'status.desactivar.embed.title', undefined, locale),
      translateForUser(userId, 'status.desactivar.embed.description', undefined, locale),
    ]);

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      title,
      description: epicQuote(description),
      author: authorData,
      footerKey: 'brand',
    });
  } catch (error: any) {
    log.commands.error({ error: error.message, userId }, '[STATUS] Error desactivando status');

    const [title, description] = await Promise.all([
      translateForUser(userId, 'status.desactivar.embed.title', undefined, locale),
      translateForUser(userId, 'status.desactivar.embed.partialError.description', { error: error.message }, locale),
    ]);

    await replyWithEpicEmbed(interaction, userId, {
      style: 'warning',
      title,
      description: epicQuote(description),
      author: authorData,
      footerKey: 'brand',
    });
  }
}

async function handleInfo(
  interaction: ChatInputCommandInteraction,
  mainAccount: { accountId: string; displayName?: string; accessToken?: string },
  locale: string | null,
) {
  const userId = interaction.user.id;

  const authorData = await getEpicAuthor(userId, {
    accountId: mainAccount.accountId,
    accessToken: mainAccount.accessToken ?? '',
    displayName: mainAccount.displayName ?? mainAccount.accountId,
  });

  try {
    const info = await callCoreWithTimeout<StatusInfoResult>('status.info', 60_000, {
      userId,
      accountId: mainAccount.accountId,
    });

    const keys = {
      deactivated: 'status.info.embed.states.deactivated',
      disconnected: 'status.info.embed.states.disconnected',
      noMessage: 'status.info.embed.states.noMessage',
      noPlatform: 'status.info.embed.states.noPlatform',
      noPresence: 'status.info.embed.states.noPresence',
      activated: 'status.info.embed.states.activated',
      connected: 'status.info.embed.states.connected',
      connecting: 'status.info.embed.states.connecting',
      reconnecting: 'status.info.embed.states.reconnecting',
    };

    const [
      title,
      description,
      stateLabel,
      xmppLabel,
      platformFieldLabel,
      presenceFieldLabel,
      messageLabel,
      connectedSinceLabel,
      deactivated,
      disconnected,
      noMessage,
      noPlatform,
      noPresence,
      activated,
      connected,
      connecting,
      reconnecting,
    ] = await Promise.all([
      translateForUser(userId, 'status.info.embed.title', undefined, locale),
      translateForUser(userId, 'status.info.embed.description', {
        account: info.connectionData?.accountName || mainAccount.displayName || mainAccount.accountId,
      }, locale),
      translateForUser(userId, 'status.info.embed.fields.state', undefined, locale),
      translateForUser(userId, 'status.info.embed.fields.xmppConnection', undefined, locale),
      translateForUser(userId, 'status.info.embed.fields.platform', undefined, locale),
      translateForUser(userId, 'status.info.embed.fields.presence', undefined, locale),
      translateForUser(userId, 'status.info.embed.fields.message', undefined, locale),
      translateForUser(userId, 'status.info.embed.fields.connectedSince', undefined, locale),
      translateForUser(userId, keys.deactivated, undefined, locale),
      translateForUser(userId, keys.disconnected, undefined, locale),
      translateForUser(userId, keys.noMessage, undefined, locale),
      translateForUser(userId, keys.noPlatform, undefined, locale),
      translateForUser(userId, keys.noPresence, undefined, locale),
      translateForUser(userId, keys.activated, undefined, locale),
      translateForUser(userId, keys.connected, undefined, locale),
      translateForUser(userId, keys.connecting, undefined, locale),
      translateForUser(userId, keys.reconnecting, undefined, locale),
    ]);

    let statusText = epicQuote(deactivated);
    let connectionText = epicQuote(disconnected);
    let messageText = epicQuote(noMessage);
    let platformText = epicQuote(noPlatform);
    let presenceText = epicQuote(noPresence);

    if (info.isActive && info.statusData) {
      statusText = epicQuote(activated);
      messageText = info.statusData.mensaje;
      platformText = await platformLabel(userId, info.statusData.plataforma, locale);
      presenceText = await presenceLabel(userId, info.statusData.presenceMode, locale);
    }

    if (info.isConnected) {
      connectionText = epicQuote(connected);
    } else if (info.connectionData?.sessionStarted) {
      connectionText = epicQuote(connecting);
    } else if (info.isActive) {
      connectionText = epicQuote(reconnecting);
    }

    let style: 'success' | 'warning' | 'error' = 'error';
    if (info.isConnected && info.eosHealthy) style = 'success';
    else if (info.isConnected && info.isActive) style = 'warning';
    else if (info.isActive) style = 'warning';

    const fields = [
      { name: epicSection(stateLabel), value: statusText, inline: true },
      { name: epicSection(xmppLabel), value: connectionText, inline: true },
      { name: epicSection(platformFieldLabel), value: platformText, inline: true },
      { name: epicSection(presenceFieldLabel), value: presenceText, inline: true },
      { name: epicSection(messageLabel), value: messageText, inline: false },
    ];

    if (info.connectionData?.connectedAt) {
      fields.push({
        name: epicSection(connectedSinceLabel),
        value: new Date(info.connectionData.connectedAt).toLocaleString(locale?.startsWith('es') ? 'es-ES' : 'en-US'),
        inline: true,
      });
    }

    let footerText: string | undefined;
    if (info.statusData) {
      footerText = await translateForUser(userId, 'status.info.embed.footer.lastUpdate', {
        date: new Date(info.statusData.lastUpdate).toLocaleString(locale?.startsWith('es') ? 'es-ES' : 'en-US'),
      }, locale);
    }

    await replyWithEpicEmbed(interaction, userId, {
      style,
      title,
      description,
      fields,
      footerText,
      footerKey: footerText ? 'none' : 'brand',
      author: authorData,
    });
  } catch (error: unknown) {
    log.commands.error({ error, userId }, '[STATUS] Error obteniendo info');
    await replyEpicApiError(interaction, userId, error);
  }
}
