/**
 * Info Subcommand Handler
 */

import axios from 'axios';
import type { Client } from 'discord.js';
import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { endpoints } from '#helpers/core/endpoints.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { accountSection, replyWithAccountEmbed } from './accountEmbedHelper.ts';

function joinDot(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}

function labeled(label: string, value: string): string {
  return `**${label}:** ${value}`;
}

function boolChip(client: Client, label: string, positive: boolean): string {
  return `${getEmoji(client, positive ? 'success' : 'error')} ${label}`;
}

function textOrEmpty(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function discordTs(dateStr: string | undefined | null, unknownDate: string, style: 'd' | 'R' | 'F' = 'd'): string {
  if (!dateStr) return unknownDate;
  try {
    const ts = Math.floor(new Date(dateStr).getTime() / 1000);
    if (Number.isNaN(ts)) return dateStr;
    return `<t:${ts}:${style}>`;
  } catch {
    return dateStr;
  }
}

export async function handleInfoSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) throw new Error('User not found');

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) throw new Error('Main account not found');

    const authorData = await getMainAccountAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    let accountData: Record<string, unknown>;
    try {
      const res = await axios.get(`${endpoints.ACCOUNT_PUBLIC}/${mainAccount.accountId}`, {
        headers: {
          Authorization: `bearer ${mainAccount.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      accountData = res.data;
    } catch (err: unknown) {
      log.epic.error({ err }, 'Error getting account info');
      const errorMsg = await translateForUser(userId, 'account.info.errors.fetchFailed');
      const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const unknownDate = await translateForUser(userId, 'account.info.values.unknownDate');

    const chips = {
      twoFa: await translateForUser(userId, 'account.info.compact.twoFa'),
      adult: await translateForUser(userId, 'account.info.compact.adult'),
      email: await translateForUser(userId, 'account.info.compact.email'),
      rename: await translateForUser(userId, 'account.info.compact.rename'),
    };

    const l = {
      accountId: await translateForUser(userId, 'account.info.fields.accountId'),
      email: await translateForUser(userId, 'account.info.fields.email'),
      country: await translateForUser(userId, 'account.info.fields.country'),
      preferredLanguage: await translateForUser(userId, 'account.info.fields.preferredLanguage'),
      name: await translateForUser(userId, 'account.info.fields.name'),
      lastName: await translateForUser(userId, 'account.info.fields.lastName'),
      phoneNumber: await translateForUser(userId, 'account.info.fields.phoneNumber'),
      company: await translateForUser(userId, 'account.info.fields.company'),
      failedLoginAttempts: await translateForUser(userId, 'account.info.fields.failedLoginAttempts'),
      lastReviewedSecuritySettings: await translateForUser(userId, 'account.info.fields.lastReviewedSecuritySettings'),
      lastLogin: await translateForUser(userId, 'account.info.fields.lastLogin'),
      numberOfDisplayNameChanges: await translateForUser(userId, 'account.info.fields.numberOfDisplayNameChanges'),
      lastDisplayNameChange: await translateForUser(userId, 'account.info.fields.lastDisplayNameChange'),
    };

    const displayName = String(accountData.displayName ?? mainAccount.displayName);
    const accountId = String(accountData.id ?? mainAccount.accountId);
    const email = textOrEmpty(accountData.email);
    const country = textOrEmpty(accountData.country);
    const language = textOrEmpty(accountData.preferredLanguage);
    const firstName = textOrEmpty(accountData.name);
    const lastName = textOrEmpty(accountData.lastName);
    const phone = textOrEmpty(accountData.phoneNumber);
    const company = textOrEmpty(accountData.company);

    const profileLines = [
      labeled(l.accountId, `\`${accountId}\``),
      email ? labeled(l.email, `\`${email}\``) : null,
      country ? labeled(l.country, country) : null,
      language ? labeled(l.preferredLanguage, language) : null,
      firstName ? labeled(l.name, firstName) : null,
      lastName ? labeled(l.lastName, lastName) : null,
      phone ? labeled(l.phoneNumber, phone) : null,
      company ? labeled(l.company, company) : null,
    ].filter(Boolean) as string[];

    const emailVerified = accountData.emailVerified === true;
    const tfaEnabled = accountData.tfaEnabled === true;
    const isAdult = accountData.minorVerified !== true;
    const canRename = accountData.canUpdateDisplayName === true;
    const failedLogins = Number(accountData.failedLoginAttempts ?? 0);
    const renameCount = Number(accountData.numberOfDisplayNameChanges ?? 0);

    const badgesLine = joinDot([
      boolChip(client, chips.email, emailVerified),
      boolChip(client, chips.twoFa, tfaEnabled),
      boolChip(client, chips.adult, isAdult),
    ]);

    const statusLines = [
      badgesLine,
      labeled(l.failedLoginAttempts, String(failedLogins)),
      labeled(
        l.lastReviewedSecuritySettings,
        discordTs(accountData.lastReviewedSecuritySettings as string, unknownDate, 'd'),
      ),
      labeled(l.lastLogin, discordTs(accountData.lastLogin as string, unknownDate, 'R')),
      joinDot([
        labeled(l.numberOfDisplayNameChanges, String(renameCount)),
        boolChip(client, chips.rename, canRename),
      ]),
      labeled(
        l.lastDisplayNameChange,
        discordTs(accountData.lastDisplayNameChange as string, unknownDate, 'd'),
      ),
    ];

    const sectionStatus = await translateForUser(userId, 'account.info.sections.status');
    const statusValue = statusLines.join('\n');

    const description = [
      profileLines.join('\n'),
      '',
      accountSection(sectionStatus),
      statusValue,
    ].join('\n');

    await replyWithAccountEmbed(interaction, userId, {
      style: 'info',
      title: await translateForUser(userId, 'account.info.title'),
      description,
      footerKey: 'brand',
      author: authorData,
      timestamp: false,
    });

    log.epic.info({ userId, displayName: mainAccount.displayName }, 'Account info retrieved');
  } catch (error: unknown) {
    log.epic.error({ error }, 'Error handling info subcommand');
    const embed = await createGenericErrorEmbed(error, interaction);
    await interaction.editReply({ embeds: [embed] });
  }
}
