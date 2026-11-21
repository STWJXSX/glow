/**
 * COMANDO /REPORT BUGS
 * Muestra un modal para reportar un bug.
 * El reporte se envía a un canal específico con Components V2,
 * botones de aceptar/rechazar (solo DEVELOPER_IDS), y auto-traducción a inglés.
 * Persistente: sobrevive reinicios del bot via modelo Feedback + evento feedbackButtons.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser, buildDiscordLocalizations } from '#helpers/locales/index.ts';
import Feedback from '#models/Feedback.ts';
import type { Command } from '#structures/types.ts';
import { createV2Container } from '#helpers/core/embedHelper.ts';
import { createFeedbackPost } from '#helpers/discord/feedback/feedbackForum.ts';
import { createFeedbackCard } from '#helpers/discord/feedback/trello.ts';


/** Translate text to English using Google Translate free endpoint.
 * Uses sl=auto so Google detects the source language.
 * Returns the translated text and the detected source language code.
 */
async function translateToEnglish(text: string): Promise<{ translated: string; detectedLang: string }> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const json = await res.json();
    // Response: [ [["translated","original",...], ...], null, "detected_lang", ... ]
    const translated = Array.isArray(json[0]) ? json[0].map((seg: any) => seg[0]).join('') : text;
    const detectedLang: string = typeof json[2] === 'string' ? json[2] : 'en';
    return { translated, detectedLang };
  } catch {
    return { translated: text, detectedLang: 'en' };
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report issues with the bot')
    .setNameLocalizations(buildDiscordLocalizations('report.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('report.cmd._1'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('bugs')
        .setDescription('Report a bug')
        .setNameLocalizations(buildDiscordLocalizations('report.cmd.bugs.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('report.cmd.bugs._1'))
    ) as SlashCommandBuilder,

  nodefer: true,
  cooldown: 30,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;

    const t = {
      modalTitle:     await translateForUser(userId, 'bugreport.modalTitle'),
      fieldTitle:     await translateForUser(userId, 'bugreport.fieldTitle'),
      fieldDesc:      await translateForUser(userId, 'bugreport.fieldDescription'),
      fieldImage:     await translateForUser(userId, 'bugreport.fieldImage'),
      sent:           await translateForUser(userId, 'bugreport.sent'),
      error:          await translateForUser(userId, 'bugreport.error'),
      configError:    await translateForUser(userId, 'bugreport.configError'),
    };

    // Show modal
    const modal = new ModalBuilder()
      .setCustomId(`bugreport_modal_${userId}`)
      .setTitle(t.modalTitle);

    const titleInput = new TextInputBuilder()
      .setCustomId('feedback_title')
      .setLabel(t.fieldTitle)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const descInput = new TextInputBuilder()
      .setCustomId('feedback_description')
      .setLabel(t.fieldDesc)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000);

    const imageInput = new TextInputBuilder()
      .setCustomId('feedback_image')
      .setLabel(t.fieldImage)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
    );

    await interaction.showModal(modal);

    // Wait for modal submission
    let modalSubmit;
    try {
      modalSubmit = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === `bugreport_modal_${userId}` && i.user.id === userId,
        time: 15 * 60 * 1000,
      });
    } catch {
      return; // Timeout
    }

    await modalSubmit.deferReply({ ephemeral: false });

    const title = modalSubmit.fields.getTextInputValue('feedback_title').trim();
    const description = modalSubmit.fields.getTextInputValue('feedback_description').trim();
    const imageUrl = modalSubmit.fields.getTextInputValue('feedback_image')?.trim() || null;

    try {
      // Translate to English (Google auto-detects source language)
      const titleResult = await translateToEnglish(title);
      const descResult = await translateToEnglish(description);
      const detectedLang = titleResult.detectedLang;
      const titleEn = titleResult.translated;
      const descEn = descResult.translated;
      // Only show translation section when the result actually differs from original
      const hasTranslation = titleEn.trim() !== title.trim() || descEn.trim() !== description.trim();

      const botAvatar = interaction.client.user?.displayAvatarURL({ size: 128 }) ?? '';
      const channelTitle = await translateForUser(userId, 'bugreport.channelTitle', undefined, interaction.locale);
      const originalLabel = await translateForUser(userId, 'bugreport.originalLang', undefined, interaction.locale);
      const englishLabel = await translateForUser(userId, 'bugreport.english', undefined, interaction.locale);
      const imageLabel = await translateForUser(userId, 'bugreport.imageLabel', undefined, interaction.locale);

      const container = createV2Container('info');

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${channelTitle}\n-# ${interaction.user.tag} (${interaction.user.id})`
            )
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar))
      );

      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${originalLabel}\n**${title}**\n${description}`
        )
      );

      if (hasTranslation) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${englishLabel}\n**${titleEn}**\n${descEn}`
          )
        );
      }

      if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${imageLabel}`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl))
        );
      }

      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      const buttonRow = new ActionRowBuilder<ButtonBuilder>();
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId('feedback_accept')
          .setEmoji('1467166006878404649')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('feedback_reject')
          .setEmoji('1467166055897235457')
          .setStyle(ButtonStyle.Danger),
      );
      container.addActionRowComponents(buttonRow);

      const thread = await createFeedbackPost(interaction.client as any, {
        type: 'bugreport',
        title: titleEn || title,
        components: [container.toJSON() as any],
        authorId: userId,
      });
      if (!thread) {
        await modalSubmit.editReply({ content: t.configError });
        return;
      }

      const trelloCard = await createFeedbackCard({
        type: 'bugreport',
        title: titleEn || title,
        description: descEn || description,
        imageUrl,
        postUrl: thread.url,
      });

      await Feedback.create({
        messageId: thread.id,
        channelId: thread.id,
        trelloCardId: trelloCard?.id ?? null,
        trelloCardUrl: trelloCard?.url ?? null,
        userId,
        type: 'bugreport',
        title,
        description,
        imageUrl,
        originalLang: detectedLang,
        titleEn,
        descriptionEn: descEn,
        status: 'pending',
      });

      await modalSubmit.editReply({ content: t.sent });
      log.commands.info({ userId, messageId: thread.id, trelloCardId: trelloCard?.id }, '[report bugs] Bug report submitted');
    } catch (err: any) {
      log.commands.error({ err }, '[report bugs] Error submitting bug report');
      await modalSubmit.editReply({ content: t.error }).catch(() => {});
    }
  },
};

export default command;
