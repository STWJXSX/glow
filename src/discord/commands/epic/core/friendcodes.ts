import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { guardBulkMode } from '#helpers/core/client/bulkAccess.ts';
import { prepareBulkAccounts, buildBulkAuthErrorField, buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { replyWithInfoEmbed } from '#helpers/commands/discord/info/infoEmbedHelper.ts';
import { replyAccountCredentialError } from '#helpers/commands/epic/account/accountEmbedHelper.ts';

const logger = log.commands;

const FRIENDCODES_ENDPOINT = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/friendcodes';

interface FriendCode {
  codeId: string;
  codeType: string;
  dateCreated: string;
}

async function handleBulkFriendcodes(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const emojiEpic = getEmoji(client, 'epic');
  const emojiXbox = getEmoji(client, 'xbox');
  const emojiError = getEmoji(client, 'error');

  const platformOpt = interaction.options.getString('platform') || 'both';
  const platformsToFetch = platformOpt === 'both' ? ['epic', 'xbox'] : [platformOpt];

  const [labelEpic, labelXbox, noCodesText] = await Promise.all([
    translateForUser(userId, 'friendcodes.platform.epic', undefined, locale),
    translateForUser(userId, 'friendcodes.platform.xbox', undefined, locale),
    translateForUser(userId, 'friendcodes.bulk.noCodes', undefined, locale),
  ]);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  if (!readyAccounts.length) {
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'friendcodes.errors.unexpected', undefined, locale),
      client,
      interaction,
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };

      const perPlat: Record<string, FriendCode[] | string> = {};
      for (const plat of platformsToFetch) {
        try {
          const res = await axios.get<FriendCode[]>(
            `${FRIENDCODES_ENDPOINT}/${account.accountId}/${plat}`,
            { headers: { Authorization: `Bearer ${account.accessToken}` } },
          );
          perPlat[plat] = res.data ?? [];
        } catch (err: any) {
          perPlat[plat] = err?.response?.data?.errorMessage ?? err.message ?? 'error';
        }
      }
      return { account, codes: perPlat, error: null };
    }),
  );

  const fields: BulkEmbedField[] = [];

  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authError' in v && v.authError) {
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.account.displayName, v.account.cuentaMain);

    if (!v.codes) continue;

    const lines: string[] = [];
    for (const [plat, data] of Object.entries(v.codes)) {
      const platEmoji = plat === 'epic' ? emojiEpic : emojiXbox;
      const platName = plat === 'epic' ? labelEpic : labelXbox;
      if (typeof data === 'string') {
        lines.push(`${platEmoji} **${platName}:** ${emojiError} \`${data}\``);
      } else if (data.length === 0) {
        lines.push(`${platEmoji} **${platName}:** ${noCodesText}`);
      } else {
        const codeList = data.slice(0, 3).map((c) => `||${c.codeId}||`).join(' ');
        const extra = data.length > 3 ? ` +${data.length - 3}` : '';
        lines.push(`${platEmoji} **${platName}:** ${codeList}${extra}`);
      }
    }

    fields.push({ name: label, value: lines.join('\n'), inline: false });
  }

  const title = await translateForUser(userId, 'friendcodes.bulk.title', {
    count: readyAccounts.length,
  }, locale);
  const summary = await translateForUser(userId, 'friendcodes.bulk.summary', undefined, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('friendcodes')
    .setDescription('Get your STW friend codes for Epic Games and Xbox')
    .setNameLocalizations(buildDiscordLocalizations('friendcodes.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('friendcodes.cmd.description'))
    .addStringOption((option) =>
      option
        .setName('platform')
        .setDescription('Platform to get friend codes for')
        .setNameLocalizations(buildDiscordLocalizations('friendcodes.cmd.platformName'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friendcodes.cmd.platformDescription'))
        .addChoices(
          {
            name: 'Epic Games',
            value: 'epic',
            name_localizations: buildDiscordLocalizations('friendcodes.cmd.choices.epic'),
          },
          {
            name: 'Xbox',
            value: 'xbox',
            name_localizations: buildDiscordLocalizations('friendcodes.cmd.choices.xbox'),
          },
          {
            name: 'Both',
            value: 'both',
            name_localizations: buildDiscordLocalizations('friendcodes.cmd.choices.both'),
          },
        )
        .setRequired(false),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('bulk')
        .setDescription('Show codes for all your accounts')
        .setNameLocalizations(buildDiscordLocalizations('friendcodes.cmd.bulkName'))
        .setDescriptionLocalizations(buildDiscordLocalizations('friendcodes.cmd.bulkDescription'))
        .setRequired(false),
    ) as SlashCommandBuilder,
  auth: true,
  deferEphemeral: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const platform = interaction.options.getString('platform') || 'both';
    const bulk = interaction.options.getBoolean('bulk') ?? false;

    try {
      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        await replyAccountCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      if (bulk) {
        if (!await guardBulkMode(interaction)) return;
        return handleBulkFriendcodes(interaction, userDb);
      }

      const mainAccount = userDb.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        await replyAccountCredentialError(interaction, userId, 'noMain');
        return;
      }

      const account = mainAccount;

      const platformsToFetch = platform === 'both' ? ['epic', 'xbox'] : [platform];
      const results: Record<string, FriendCode[] | { error: string }> = {};

      for (const plat of platformsToFetch) {
        try {
          const url = `${FRIENDCODES_ENDPOINT}/${account.accountId}/${plat}`;
          logger.info({ url, platform: plat }, '[friendcodes] Fetching codes');

          const res = await axios.get<FriendCode[]>(url, {
            headers: {
              Authorization: `Bearer ${account.accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          results[plat] = res.data || [];
        } catch (err: any) {
          logger.error({ error: err?.response?.data || err, platform: plat }, '[friendcodes] Error fetching codes');
          results[plat] = { error: err?.response?.data?.errorMessage || err.message };
        }
      }

      const authorData = await getMainAccountAuthor(userId, {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
      });

      const emojiEpic = getEmoji(interaction.client, 'epic');
      const emojiXbox = getEmoji(interaction.client, 'xbox');

      const [
        embedTitle,
        codesLabel,
        createdLabel,
        codeLabel,
        noCodesLabel,
        infoNote,
        fetchErrorLabel,
        labelEpic,
        labelXbox,
        unknownCodeType,
      ] = await Promise.all([
        translateForUser(userId, 'friendcodes.embed.title', undefined, locale),
        translateForUser(userId, 'friendcodes.embed.codes', undefined, locale),
        translateForUser(userId, 'friendcodes.embed.created', undefined, locale),
        translateForUser(userId, 'friendcodes.embed.code', undefined, locale),
        translateForUser(userId, 'friendcodes.embed.noCodes', undefined, locale),
        translateForUser(userId, 'friendcodes.embed.info', undefined, locale),
        translateForUser(userId, 'friendcodes.errors.fetchError', undefined, locale),
        translateForUser(userId, 'friendcodes.platform.epic', undefined, locale),
        translateForUser(userId, 'friendcodes.platform.xbox', undefined, locale),
        translateForUser(userId, 'friendcodes.embed.unknownCodeType', undefined, locale),
      ]);

      let body = '';

      for (const [plat, data] of Object.entries(results)) {
        const platformEmoji = plat === 'epic' ? emojiEpic : emojiXbox;
        const platformName = plat === 'epic' ? labelEpic : labelXbox;

        if ('error' in data) {
          body += `${platformEmoji} **${platformName}**\n`;
          body += `${fetchErrorLabel}: \`${data.error}\`\n\n`;
        } else if (Array.isArray(data) && data.length > 0) {
          body += `${platformEmoji} **${platformName}** (${data.length} ${codesLabel})\n`;

          for (let index = 0; index < data.length; index++) {
            const code = data[index];
            const codeType = code.codeType?.replace('CodeToken:', '') || unknownCodeType;
            const dateCreated = code.dateCreated
              ? new Date(code.dateCreated).toLocaleDateString()
              : '—';

            body += `\`${index + 1}.\` **${codeType}**\n`;
            body += `> ${createdLabel}: ${dateCreated}\n`;
            body += `> ${codeLabel}: ||${code.codeId}||\n\n`;
          }
        } else {
          body += `${platformEmoji} **${platformName}**\n`;
          body += `> ${noCodesLabel}\n\n`;
        }
      }

      await replyWithInfoEmbed(interaction, userId, {
        style: 'info',
        title: embedTitle,
        description: `${body.trim()}\n\n-# ${infoNote}`,
        author: authorData,
        footerKey: 'sensitive',
      });
    } catch (error: any) {
      logger.error({ error }, '[friendcodes] Error in command');
      try {
        await replyWithInfoEmbed(interaction, userId, {
          style: 'error',
          description: await translateForUser(userId, 'friendcodes.errors.unexpected', undefined, locale),
          footerKey: 'brand',
        });
      } catch (e) {
        logger.error({ error: e }, '[friendcodes] Error sending error embed');
      }
    }
  },
};

export default command;
