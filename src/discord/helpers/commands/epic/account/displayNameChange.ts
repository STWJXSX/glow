import type { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import {
  updateMainAccountDisplayName,
  validateEpicDisplayName,
} from '#helpers/epic/account/updateEpicDisplayName.ts';
import { replyWithAccountEmbed } from './accountEmbedHelper.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';

function discordTs(dateStr: string | null | undefined, unknown: string): string {
  if (!dateStr) return unknown;
  try {
    const ts = Math.floor(new Date(dateStr).getTime() / 1000);
    if (Number.isNaN(ts)) return dateStr;
    return `<t:${ts}:F> (<t:${ts}:R>)`;
  } catch {
    return dateStr;
  }
}

export async function handleDisplayNameChangeSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const rawName = interaction.options.getString('name', true);

  const validation = validateEpicDisplayName(rawName);
  if (validation === 'invalid') {
    const invalidMsg = await translateForUser(userId, 'displayname.errors.invalid', undefined, locale);
    const rules = await translateForUser(userId, 'displayname.validation.rules', undefined, locale);
    const embed = await createGenericErrorEmbed(`${invalidMsg}\n\n${rules}`, interaction);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const result = await updateMainAccountDisplayName(userId, rawName);

  if (!result.ok) {
    const unknownDate = await translateForUser(userId, 'account.info.values.unknownDate', undefined, locale);
    let messageKey = 'displayname.errors.apiFailed';
    const replacements: Record<string, string> = {};

    switch (result.code) {
      case 'no_user':
      case 'no_main':
        messageKey = 'displayname.errors.noMain';
        break;
      case 'same':
        messageKey = 'displayname.errors.sameName';
        replacements.name = rawName.trim();
        break;
      case 'cooldown':
        messageKey = 'displayname.errors.cooldown';
        replacements.when = discordTs(result.lastDisplayNameChange, unknownDate);
        break;
      case 'token':
        messageKey = 'displayname.errors.tokenFailed';
        break;
      case 'api':
        messageKey = 'displayname.errors.apiFailed';
        replacements.detail = result.apiMessage ? `\n${result.apiMessage}` : '';
        break;
      default:
        break;
    }

    const description = await translateForUser(userId, messageKey, replacements, locale);
    const embed = await createGenericErrorEmbed({ message: description }, interaction);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const authorData = await getMainAccountAuthor(userId, {
    accountId: result.accountId,
    displayName: result.newName,
  });

  const successEmoji = getEmoji(interaction.client, 'success');
  const title = await translateForUser(userId, 'displayname.success.title', undefined, locale);
  const description = await translateForUser(
    userId,
    'displayname.success.description',
    { old: result.oldName, new: result.newName },
    locale,
  );

  await replyWithAccountEmbed(interaction, userId, {
    style: 'success',
    title: `${successEmoji} ${title}`,
    description,
    footerKey: 'security',
    author: authorData,
    timestamp: true,
  });

  log.commands.info(
    { userId, accountId: result.accountId, oldName: result.oldName, newName: result.newName },
    '[DisplayName] Updated main account display name',
  );
}
