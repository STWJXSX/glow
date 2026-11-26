/**
 * COMANDO /STATS (MODSTATS)
 * Gestiona estadísticas de gameplay usando MCP
 */

import { SlashCommandBuilder, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyEpicApiError,
  getEpicAuthor,
  translateEpic,
  epicSection,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const STAT_NAMES = [
  'zonescompleted',
  'totalroyalroyales',
  'habaneroprogression',
  'habaneros27',
] as const;

async function getStatDescription(
  userId: string,
  statName: string,
  locale: string | null,
): Promise<string> {
  return translateForUser(userId, `modstats.stats.${statName}`, undefined, locale);
}

function parseGameplayStats(profileData: any): Array<{ name: string; value: number }> {
  const stats = profileData?.profileChanges?.[0]?.profile?.stats?.attributes?.gameplay_stats;
  if (!stats) return [];
  return stats.map((stat: any) => ({
    name: stat.statName || 'unknown',
    value: stat.statValue || 0,
  }));
}

async function handleBulkStatsModify(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  statName: string,
  statValue: number,
  statDescription: string,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);
  const noAccessLabel = await translateForUser(userId, 'modstats.errors.noAccess', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        await composeMCP({
          operation: 'SetGameplayStats',
          profile: 'campaign',
          accountId: account.accountId,
          accessToken: account.accessToken,
          body: { gameplayStats: [{ statName, statValue }] },
        });
        return { account, ok: true as const };
      } catch (err: any) {
        const errorCode = err?.errorCode || err?.response?.data?.errorCode;
        if (
          errorCode === 'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed' ||
          errorCode === 'errors.com.epicgames.fortnite.operation_forbidden'
        ) {
          return { account, ok: false as const, reason: 'noAccess' as const };
        }
        return { account, ok: false as const, reason: 'failed' as const };
      }
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
    if (v.ok) {
      fields.push({
        name: label,
        value: epicEmojiLine(client, 'success', `${statDescription}: **${statValue}**`),
        inline: true,
      });
    } else if (v.reason === 'noAccess') {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', noAccessLabel), inline: true });
    } else {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', failedLabel), inline: true });
    }
  }

  const title = await translateForUser(userId, 'modstats.bulk.modifyTitle', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'modstats.bulk.modifySummary', {
    stat: statDescription,
    value: String(statValue),
  }, locale);
  await sendBulkPaginated(interaction, title, summary, fields, 'success');
}

async function handleBulkStatsVer(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const noStatsLabel = await translateForUser(userId, 'bulkMode.noStats', undefined, locale);
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        const profileData = await composeMCP({
          operation: 'QueryProfile',
          profile: 'campaign',
          accountId: account.accountId,
          accessToken: account.accessToken,
        });
        const gameplayStats = parseGameplayStats(profileData);
        return { account, stats: gameplayStats };
      } catch {
        return { account, error: true as const };
      }
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
    if ('error' in v && v.error) {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', failedLabel), inline: true });
      continue;
    }
    if (!v.stats.length) {
      fields.push({ name: label, value: noStatsLabel, inline: true });
      continue;
    }
    const statCount = await translateForUser(userId, 'modstats.bulk.statCount', {
      count: String(v.stats.length),
    }, locale);
    fields.push({ name: label, value: statCount, inline: true });
  }

  const title = await translateForUser(userId, 'modstats.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'modstats.bulk.summary', undefined, locale);
  await sendBulkPaginated(interaction, title, summary, fields, 'info');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Manage gameplay statistics using MCP')
    .setNameLocalizations(buildDiscordLocalizations('stats.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('stats.cmd.description'))
    .setDMPermission(true)
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('ver')
          .setDescription('Show all available gameplay statistics')
          .setNameLocalizations(buildDiscordLocalizations('stats.cmd.subcommands.ver.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('stats.cmd.subcommands.ver.description')),
        'modstats.bulk.optionDescription',
      ),
    )
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('modificar')
          .setDescription('Modify a specific statistic')
          .setNameLocalizations(buildDiscordLocalizations('stats.cmd.subcommands.modificar.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('stats.cmd.subcommands.modificar.description'))
          .addStringOption(option =>
            option
              .setName('estadistica')
              .setDescription('Select the statistic to modify')
              .setNameLocalizations(buildDiscordLocalizations('stats.cmd.options.estadistica.name'))
              .setDescriptionLocalizations(buildDiscordLocalizations('stats.cmd.options.estadistica.description'))
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addIntegerOption(option =>
            option
              .setName('valor')
              .setDescription('New value for the statistic')
              .setNameLocalizations(buildDiscordLocalizations('stats.cmd.options.valor.name'))
              .setDescriptionLocalizations(buildDiscordLocalizations('stats.cmd.options.valor.description'))
              .setRequired(true)
              .setMinValue(0)
              .setMaxValue(999999999),
          ),
        'modstats.bulk.modifyOptionDescription',
      ),
    ),

  auth: true,
  prem: true,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const focusedValue = interaction.options.getFocused().toLowerCase();

    const named = await Promise.all(
      STAT_NAMES.map(async (name) => ({
        name,
        description: await getStatDescription(userId, name, locale),
      })),
    );

    const filtered = named.filter(stat =>
      stat.name.toLowerCase().includes(focusedValue) ||
      stat.description.toLowerCase().includes(focusedValue),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(stat => ({
        name: `${stat.name} - ${stat.description}`,
        value: stat.name,
      })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const client = interaction.client;
    const locale = interaction.locale;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'ver') {
      const bulk = interaction.options.getBoolean('bulk') ?? false;
      if (bulk) {
        if (!await guardBulkMode(interaction)) return;
        const userDb = await UsuarioInfo.findOne({ id: userId });
        if (!userDb) {
          await replyEpicCredentialError(interaction, userId, 'noCuenta');
          return;
        }
        return handleBulkStatsVer(interaction, userDb);
      }
    }

    const user = await UsuarioInfo.findOne({ id: userId });
    const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    if (subcommand === 'ver') {
      try {
        log.bot.info(`[stats] Obteniendo estadísticas para ${mainAccount.accountId}`);

        const profileData = await composeMCP({
          operation: 'QueryProfile',
          profile: 'campaign',
          accountId: mainAccount.accountId,
          accessToken: mainAccount.accessToken,
        });

        let gameplayStats: Array<{ name: string; value: number }> = [];

        if (profileData.profileChanges?.[0]) {
          gameplayStats = parseGameplayStats(profileData);
        }

        if (!gameplayStats.length) {
          const [title, description] = await Promise.all([
            translateEpic(client, userId, 'modstats.embed.view.noStats.title', 'info', undefined, locale),
            translateForUser(userId, 'modstats.embed.view.noStats.description', undefined, locale),
          ]);

          await replyWithEpicEmbed(interaction, userId, {
            style: 'info',
            title,
            description,
            author: authorData,
            footerKey: 'brand',
          });
          return;
        }

        const unknownLabel = await translateForUser(userId, 'modstats.unknownStat', undefined, locale);
        const statsText = (await Promise.all(
          gameplayStats.map(async (stat) => {
            const description = STAT_NAMES.includes(stat.name as typeof STAT_NAMES[number])
              ? await getStatDescription(userId, stat.name, locale)
              : (stat.name === 'unknown' ? unknownLabel : stat.name);
            return `- **${description}:** \`${stat.value}\``;
          }),
        )).join('\n');

        const [title, sectionLabel, footerText] = await Promise.all([
          translateEpic(client, userId, 'modstats.embed.view.title', 'stats', undefined, locale),
          translateForUser(userId, 'modstats.embed.view.currentStats', undefined, locale),
          translateForUser(userId, 'modstats.embed.view.footer', { count: gameplayStats.length }, locale),
        ]);

        await replyWithEpicEmbed(interaction, userId, {
          style: 'info',
          title,
          fields: [{
            name: epicSection(sectionLabel),
            value: statsText,
            inline: false,
          }],
          footerText,
          author: authorData,
          footerKey: 'none',
        });
      } catch (err: any) {
        log.bot.error({ error: err?.response?.data || err }, '[stats] Error obteniendo estadísticas');

        if (err?.response?.status === 404) {
          const [title, description] = await Promise.all([
            translateEpic(client, userId, 'modstats.embed.view.noStats.title', 'info', undefined, locale),
            translateForUser(userId, 'modstats.errors.invalidProfile', undefined, locale),
          ]);

          await replyWithEpicEmbed(interaction, userId, {
            style: 'info',
            title,
            description,
            author: authorData,
            footerKey: 'brand',
          });
          return;
        }

        await replyEpicApiError(interaction, userId, err);
      }
    } else if (subcommand === 'modificar') {
      const statName = interaction.options.getString('estadistica', true);
      const statValue = interaction.options.getInteger('valor', true);
      const bulk = interaction.options.getBoolean('bulk') ?? false;

      const validStat = STAT_NAMES.find(stat => stat === statName);
      if (!validStat) {
        await replyEpicCustomError(interaction, userId, 'modstats.errors.invalidStat', { statName });
        return;
      }

      const statDescription = await getStatDescription(userId, validStat, locale);

      if (bulk) {
        if (!await guardBulkMode(interaction)) return;
        const userDb = await UsuarioInfo.findOne({ id: userId });
        if (!userDb) {
          await replyEpicCredentialError(interaction, userId, 'noCuenta');
          return;
        }
        return handleBulkStatsModify(interaction, userDb, statName, statValue, statDescription);
      }

      try {
        await composeMCP({
          operation: 'SetGameplayStats',
          profile: 'campaign',
          accountId: mainAccount.accountId,
          accessToken: mainAccount.accessToken,
          body: {
            gameplayStats: [{ statName, statValue }],
          },
        });

        const [title, description, statisticLabel, newValueLabel, descLabel, footerText] = await Promise.all([
          translateEpic(client, userId, 'modstats.embed.modify.title', 'success', undefined, locale),
          translateEpic(client, userId, 'modstats.embed.modify.description', 'success', undefined, locale),
          translateForUser(userId, 'modstats.embed.modify.fields.statistic', undefined, locale),
          translateForUser(userId, 'modstats.embed.modify.fields.newValue', undefined, locale),
          translateForUser(userId, 'modstats.embed.modify.fields.description', undefined, locale),
          translateForUser(userId, 'modstats.embed.modify.footer', undefined, locale),
        ]);

        await replyWithEpicEmbed(interaction, userId, {
          style: 'success',
          title,
          description,
          fields: [
            { name: epicSection(statisticLabel), value: statDescription, inline: true },
            { name: epicSection(newValueLabel), value: statValue.toString(), inline: true },
            { name: epicSection(descLabel), value: validStat, inline: false },
          ],
          footerText,
          author: authorData,
          footerKey: 'none',
        });
      } catch (err: any) {
        const errorCode = err?.errorCode || err?.response?.data?.errorCode;

        if (
          errorCode === 'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed' ||
          errorCode === 'errors.com.epicgames.fortnite.operation_forbidden'
        ) {
          await replyEpicCustomError(interaction, userId, 'modstats.errors.noAccess');
          return;
        }

        await replyEpicApiError(interaction, userId, err);
      }
    }
  },
};

export default command;
