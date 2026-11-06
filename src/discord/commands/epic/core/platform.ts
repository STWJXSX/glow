/**
 * COMANDO /PLATFORM
 * Cambia la plataforma de la cual se usarán los V-Bucks
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { guardBulkMode, addBulkOptionToCommand } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import type { Command } from '#structures/types.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  getEpicAuthor,
  epicSection,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const PLATFORMS = [
  { value: 'Epic', choiceKey: 'platform.cmd.choices.epic' },
  { value: 'EpicPC', choiceKey: 'platform.cmd.choices.epicPC' },
  { value: 'EpicAndroid', choiceKey: 'platform.cmd.choices.epicAndroid' },
  { value: 'EpicPCKorea', choiceKey: 'platform.cmd.choices.epicPCKorea' },
  { value: 'PSN', choiceKey: 'platform.cmd.choices.psn' },
  { value: 'Live', choiceKey: 'platform.cmd.choices.live' },
  { value: 'IOSAppStore', choiceKey: 'platform.cmd.choices.iosAppStore' },
  { value: 'Nintendo', choiceKey: 'platform.cmd.choices.nintendo' },
  { value: 'Samsung', choiceKey: 'platform.cmd.choices.samsung' },
  { value: 'GooglePlay', choiceKey: 'platform.cmd.choices.googlePlay' },
  { value: 'WeGame', choiceKey: 'platform.cmd.choices.weGame' },
  { value: 'Shared', choiceKey: 'platform.cmd.choices.shared' },
] as const;

async function handleBulkPlatform(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  newPlatform: string,
  platformName: string,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const changedLabel = await translateForUser(userId, 'bulkMode.changed', undefined, locale);
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        await composeMCP({
          profile: 'common_core',
          operation: 'SetMtxPlatform',
          accountId: account.accountId,
          accessToken: account.accessToken,
          body: { newPlatform },
        });
        return { account, ok: true as const };
      } catch {
        return { account, ok: false as const };
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
        value: epicEmojiLine(client, 'success', `${changedLabel}: ${platformName}`),
        inline: true,
      });
    } else {
      fields.push({
        name: label,
        value: epicEmojiLine(client, 'error', failedLabel),
        inline: true,
      });
    }
  }

  const title = await translateForUser(userId, 'mtxplatform.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'mtxplatform.bulk.summary', {
    platform: platformName,
  }, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'success');
}

const command: Command = {
  data: addBulkOptionToCommand(
    new SlashCommandBuilder()
      .setName('platform')
      .setDescription('Change the platform from which V-Bucks will be used')
      .setNameLocalizations(buildDiscordLocalizations('platform.cmd.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('platform.cmd.description'))
      .setDMPermission(true)
      .addStringOption(option =>
        option
          .setName('platform')
          .setDescription('Select the new platform')
          .setNameLocalizations(buildDiscordLocalizations('platform.cmd.options.platform.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('platform.cmd.options.platform.description'))
          .setRequired(true)
          .setAutocomplete(true),
      ),
    'mtxplatform.bulk.optionDescription',
  ) as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 5,

  async autocomplete(interaction: AutocompleteInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const focusedValue = interaction.options.getFocused().toLowerCase();

    const named = await Promise.all(
      PLATFORMS.map(async (platform) => ({
        ...platform,
        name: await translateForUser(userId, platform.choiceKey, undefined, locale),
      })),
    );

    const filtered = named.filter(platform =>
      platform.name.toLowerCase().includes(focusedValue) ||
      platform.value.toLowerCase().includes(focusedValue),
    );

    await interaction.respond(
      filtered.slice(0, 25).map(platform => ({
        name: platform.name,
        value: platform.value,
      })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const newPlatform = interaction.options.getString('platform', true);

    const validPlatform = PLATFORMS.find(p => p.value === newPlatform);
    if (!validPlatform) {
      await replyEpicCustomError(interaction, userId, 'mtxplatform.errors.invalidPlatform');
      return;
    }

    const platformName = await translateForUser(userId, validPlatform.choiceKey, undefined, locale);
    const bulk = interaction.options.getBoolean('bulk') ?? false;

    if (bulk) {
      if (!await guardBulkMode(interaction)) return;
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }
      return handleBulkPlatform(interaction, user, newPlatform, platformName);
    }

    try {
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const authorData = await getEpicAuthor(userId, {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
      });

      log.epic.info(`Changing platform to ${newPlatform} for ${mainAccount.displayName}`);

      await composeMCP({
        profile: 'common_core',
        operation: 'SetMtxPlatform',
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        body: { newPlatform },
      });

      log.epic.info(`Platform changed to ${newPlatform} successfully`);

      const [title, description, platformLabel] = await Promise.all([
        translateForUser(userId, 'mtxplatform.embed.title', undefined, locale),
        translateForUser(userId, 'mtxplatform.embed.description', undefined, locale),
        translateForUser(userId, 'mtxplatform.embed.platformField', undefined, locale),
      ]);

      await replyWithEpicEmbed(interaction, userId, {
        style: 'success',
        title,
        description,
        fields: [
          {
            name: epicSection(platformLabel),
            value: platformName,
            inline: true,
          },
        ],
        author: authorData,
        footerKey: 'brand',
      });
    } catch (error: unknown) {
      log.epic.error({ error }, 'Error changing platform');
      await replyEpicCustomError(interaction, userId, 'epic.errors.unexpected');
    }
  },
};

export default command;
