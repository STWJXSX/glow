import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { createV2Container } from '#helpers/core/embedHelper.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Shows bot support information')
    .setNameLocalizations(buildDiscordLocalizations('support.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('support.cmd._1')),

  cooldown: 5,
  nodefer: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;

    const title = await translateForUser(userId, 'support.embed.title', undefined, locale);
    const description = await translateForUser(userId, 'support.embed.description', undefined, locale);
    const buttonLabel = await translateForUser(userId, 'support.button.label', undefined, locale);

    const supportServerId = process.env.SUPPORT_SERVER || '810129117260283915';
    const supportInvite = process.env.SUPPORT_SERVER_INVITE || 'https://discord.gg/KUwvtWrS8W';

    const server = interaction.client.guilds.cache.get(supportServerId);
    const serverIcon = server ? server.iconURL({ size: 512 }) : null;
    const embedImage = 'https://cdn.discordapp.com/attachments/1350070719245062184/1464591214610354258/pc61tFT.png?ex=6976065c&is=6974b4dc&hm=ed9302bc81455987daa712752686335ec78a1bbc3c2b1202754a1b50839d9fcd&';

    const container = createV2Container('info');

    const header = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n\n${description}`),
    );
    if (serverIcon) {
      header.setThumbnailAccessory(new ThumbnailBuilder().setURL(serverIcon));
    }
    container.addSectionComponents(header);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(embedImage),
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const button = new ButtonBuilder()
      .setLabel(buttonLabel)
      .setURL(supportInvite)
      .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    container.addActionRowComponents(row);

    await interaction.reply({
      components: [container.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);
  },
};

export default command;
