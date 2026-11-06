import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import UserPrivacy from '#models/UserPrivacy.ts';
import { invalidatePrivacyCache } from '#helpers/epic/account/avatarHandler.ts';
import { createInfoEmbed, createSuccessEmbed } from '#helpers/core/embedHelper.ts';

async function replyWithEmbed(
  interaction: ChatInputCommandInteraction,
  embed: Awaited<ReturnType<typeof createSuccessEmbed>>,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [],
      files: [],
    });
    return;
  }

  await interaction.reply({ embeds: [embed] });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('privacy')
    .setDescription('Manage your privacy settings')
    .setNameLocalizations(buildDiscordLocalizations('privacy.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('privacy.cmd._1'))
    .setDMPermission(true)
    .addSubcommand(sub =>
      sub
        .setName('enable')
        .setDescription('Hide your in-game name with asterisks in bot responses')
        .setNameLocalizations(buildDiscordLocalizations('privacy.cmd.enable.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('privacy.cmd.enable._1'))
    )
    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('Show your in-game name normally in bot responses')
        .setNameLocalizations(buildDiscordLocalizations('privacy.cmd.disable.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('privacy.cmd.disable._1'))
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Check your current privacy settings')
        .setNameLocalizations(buildDiscordLocalizations('privacy.cmd.status.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('privacy.cmd.status._1'))
    ),

  cooldown: 3,
  auth: false,
  nodefer: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const locale = interaction.locale;

    if (sub === 'enable') {
      await UserPrivacy.findOneAndUpdate(
        { discordId: userId },
        { maskName: true, updatedAt: new Date() },
        { upsert: true, new: true },
      );
      invalidatePrivacyCache(userId);

      const title = await translateForUser(userId, 'privacy.enabled.title', undefined, locale);
      const desc = await translateForUser(userId, 'privacy.enabled.description', undefined, locale);

      const embed = await createSuccessEmbed({
        title: `${getEmoji(interaction.client, 'success')} ${title}`,
        description: desc,
        footer: 'user',
        interaction,
      });

      await replyWithEmbed(interaction, embed);
      return;
    }

    if (sub === 'disable') {
      await UserPrivacy.findOneAndUpdate(
        { discordId: userId },
        { maskName: false, updatedAt: new Date() },
        { upsert: true, new: true },
      );
      invalidatePrivacyCache(userId);

      const title = await translateForUser(userId, 'privacy.disabled.title', undefined, locale);
      const desc = await translateForUser(userId, 'privacy.disabled.description', undefined, locale);

      const embed = await createSuccessEmbed({
        title: `${getEmoji(interaction.client, 'success')} ${title}`,
        description: desc,
        footer: 'user',
        interaction,
      });

      await replyWithEmbed(interaction, embed);
      return;
    }

    const record = await UserPrivacy.findOne({ discordId: userId });
    const maskName = record?.maskName ?? false;

    const title = await translateForUser(userId, 'privacy.status.title', undefined, locale);
    const labelMask = await translateForUser(userId, 'privacy.status.maskName', undefined, locale);
    const labelOn = await translateForUser(userId, 'privacy.status.on', undefined, locale);
    const labelOff = await translateForUser(userId, 'privacy.status.off', undefined, locale);

    const embed = await createInfoEmbed({
      title,
      fields: [{
        name: labelMask,
        value: maskName
          ? `${getEmoji(interaction.client, 'success')} ${labelOn}`
          : `${getEmoji(interaction.client, 'error')} ${labelOff}`,
      }],
      footer: 'user',
      interaction,
    });

    await replyWithEmbed(interaction, embed);
  },
};

export default command;
