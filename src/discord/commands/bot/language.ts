import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { log } from '#helpers/core/logger.ts';
import {
  buildDiscordLocalizations,
  setUserLanguage,
  translate,
  translateForUser,
  invalidateUserLanguageCache,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '#helpers/locales/index.ts';
import { createErrorEmbed, createSuccessEmbed } from '#helpers/core/embedHelper.ts';

const languageChoices = SUPPORTED_LANGUAGES.map((code) => ({
  name: LANGUAGE_LABELS[code],
  value: code,
}));

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set your preferred bot language')
    .setDescriptionLocalizations(buildDiscordLocalizations('language.slash.description'))
    .addStringOption((opt) =>
      opt
        .setName('language')
        .setDescription('Choose a language')
        .setNameLocalizations(buildDiscordLocalizations('language.slash.option.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('language.slash.option.description'))
        .setRequired(true)
        .addChoices(...languageChoices),
    ) as SlashCommandBuilder,

  cooldown: 5,
  nodefer: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const lang = interaction.options.getString('language', true) as SupportedLanguage;

    try {
      const saved = await setUserLanguage(interaction.user.id, lang);
      if (!saved) throw new Error('Failed to save language');

      invalidateUserLanguageCache(interaction.user.id);

      const embed = await createSuccessEmbed({
        title: `${getEmoji(interaction.client, 'success')} ${translate('language.updatedTitle', lang)}`,
        description: translate('language.updatedDescription', lang, {
          language: LANGUAGE_LABELS[lang],
        }),
        footer: 'user',
        interaction,
      });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      log.commands.error({ error: err, userId: interaction.user.id }, '[language] DB error');

      const errorMsg = await translateForUser(
        interaction.user.id,
        'language.saveError',
        undefined,
        interaction.locale,
      );

      const embed = await createErrorEmbed({
        title: `${getEmoji(interaction.client, 'error')} Error`,
        description: errorMsg,
        interaction,
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

export default command;
