import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { getLauncherToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import {
  buildInfoReplyPayload,
  replyWithInfoEmbed,
} from '#helpers/commands/discord/info/infoEmbedHelper.ts';

interface DeviceAuthEntry {
  deviceId: string;
  userAgent?: string;
  created?: { location?: string; ipAddress?: string; dateTime?: string };
  lastAccess?: { location?: string; ipAddress?: string; dateTime?: string };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `<t:${Math.floor(d.getTime() / 1000)}:f>`;
}

function maskIp(ip: string): string {
  if (!ip || ip === '—') return '—';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return ip.replace(/:[\da-f]+$/i, ':***');
}

function shortAgent(ua: string | undefined, fallback: string): string {
  if (!ua) return fallback;
  if (ua.length > 60) return ua.substring(0, 57) + '...';
  return ua;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('auths')
    .setDescription('View the device auths linked to your Epic account')
    .setNameLocalizations(buildDiscordLocalizations('auths.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('auths.cmd.description')) as SlashCommandBuilder,

  auth: true,
  deferEphemeral: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client;
    const userId = interaction.user.id;
    const locale = interaction.locale;

    const emojiWarning = getEmoji(client, 'warning');

    try {
      const userInfo = await UsuarioInfo.findOne({ id: userId });
      if (!userInfo) {
        const embed = await generarEmbedError('noCuenta', { client, interaction });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const mainAccount = userInfo.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        const embed = await generarEmbedError('noMain', { client, interaction });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const account = mainAccount;

      const authorData = await getMainAccountAuthor(userId, {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
      });

      const launcherToken = await getLauncherToken(account.accessToken);
      if (!launcherToken) {
        await replyWithInfoEmbed(interaction, userId, {
          style: 'error',
          description: await translateForUser(userId, 'auths.errors.launcherToken', undefined, locale),
          author: authorData,
          footerKey: 'security',
        });
        return;
      }

      let deviceAuths: DeviceAuthEntry[] = [];
      try {
        const res = await axios.get(
          `${Endpoints.ACCOUNT_DEVICEAUTH_LIST}/${account.accountId}/deviceAuth`,
          {
            headers: {
              Authorization: `Bearer ${launcherToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        deviceAuths = res.data || [];
      } catch (err: any) {
        const embed = await generarEmbedError('api', { apiError: err, client, interaction });
        if (authorData) embed.setAuthor({ name: authorData.name, iconURL: authorData.iconURL });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (!deviceAuths.length) {
        await replyWithInfoEmbed(interaction, userId, {
          style: 'info',
          description: await translateForUser(
            userId,
            'auths.embed1.nada',
            { emoji: emojiWarning },
            locale,
          ),
          author: authorData,
          footerKey: 'security',
        });
        return;
      }

      const [
        title,
        viewDescription,
        deprecatedNotice,
        labelIp,
        labelDevice,
        labelCreated,
        labelLastAccess,
        labelId,
        unknownAgent,
      ] = await Promise.all([
        translateForUser(userId, 'auths.embed1.title', undefined, locale),
        translateForUser(userId, 'auths.embed1.viewDescription', { count: deviceAuths.length }, locale),
        translateForUser(userId, 'auths.embed1.deprecatedNotice', undefined, locale),
        translateForUser(userId, 'auths.detail.ip', undefined, locale),
        translateForUser(userId, 'auths.detail.device', undefined, locale),
        translateForUser(userId, 'auths.detail.created', undefined, locale),
        translateForUser(userId, 'auths.detail.lastAccess', undefined, locale),
        translateForUser(userId, 'auths.detail.id', undefined, locale),
        translateForUser(userId, 'auths.detail.unknownAgent', undefined, locale),
      ]);

      const embeds = [];
      const mainPayload = await buildInfoReplyPayload(
        userId,
        {
          style: 'info',
          title,
          description: `${viewDescription}\n\n${deprecatedNotice}`,
          author: authorData,
          footerKey: 'security',
          timestamp: false,
        },
        interaction,
        locale,
      );
      embeds.push(mainPayload.embeds[0]);

      const BATCH_SIZE = 8;
      for (let i = 0; i < deviceAuths.length; i += BATCH_SIZE) {
        const batch = deviceAuths.slice(i, i + BATCH_SIZE);
        let desc = '';

        for (let j = 0; j < batch.length; j++) {
          const auth = batch[j];
          const idx = i + j + 1;
          const location = auth.created?.location || auth.lastAccess?.location || '—';
          const ip = maskIp(auth.created?.ipAddress || auth.lastAccess?.ipAddress || '');
          const created = fmtDate(auth.created?.dateTime);
          const lastAccess = fmtDate(auth.lastAccess?.dateTime);
          const agent = shortAgent(auth.userAgent, unknownAgent);

          desc += `**#${idx}** — \`${location}\`\n`;
          desc += `> **${labelIp}:** \`${ip}\`\n`;
          desc += `> **${labelDevice}:** \`${agent}\`\n`;
          desc += `> **${labelCreated}:** ${created}\n`;
          desc += `> **${labelLastAccess}:** ${lastAccess}\n`;
          desc += `> **${labelId}:** \`${auth.deviceId.substring(0, 8)}...\`\n\n`;
        }

        if (desc.length > 4000) desc = desc.substring(0, 3997) + '...';

        const detailTitle = await translateForUser(
          userId,
          'auths.detail.title',
          {
            from: i + 1,
            to: Math.min(i + BATCH_SIZE, deviceAuths.length),
            total: deviceAuths.length,
          },
          locale,
        );

        const detailPayload = await buildInfoReplyPayload(
          userId,
          {
            style: 'info',
            title: detailTitle,
            description: desc.trim(),
            author: authorData,
            footerKey: 'none',
          },
          interaction,
          locale,
        );
        embeds.push(detailPayload.embeds[0]);
      }

      embeds[embeds.length - 1].setTimestamp();

      const logoFile = mainPayload.files[0];
      const MAX_EMBEDS = 10;
      for (let i = 0; i < embeds.length; i += MAX_EMBEDS) {
        const chunk = embeds.slice(i, i + MAX_EMBEDS);
        if (i === 0) {
          await interaction.editReply({ embeds: chunk, files: [logoFile] });
        } else {
          await interaction.followUp({ embeds: chunk, files: [logoFile], ephemeral: true });
        }
      }
    } catch (err: any) {
      await replyWithInfoEmbed(interaction, userId, {
        style: 'error',
        description: await translateForUser(userId, 'auths.errors.unexpected', undefined, locale),
        footerKey: 'brand',
      });
    }
  },
};

export default command;
