/**
 * Community channel posts for published STW loadouts (Components V2 + MediaGallery).
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type Client,
  type Message,
} from 'discord.js';
import type { ICommunityLoadout } from '#models/CommunityLoadout.ts';
import { getUserLanguage, translate } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { EMBED_COLORS, createV2Container } from '#helpers/core/embedHelper.ts';

export const LO_PUB_PREFIX = 'lo_pub';

/** Public community channel posts are always English (image + message chrome). */
export const COMMUNITY_CHANNEL_LANG = 'en' as const satisfies SupportedLanguage;

export function loPubCustomId(action: 'lk' | 'dk' | 'cl' | 'cs', ...parts: string[]): string {
  return [LO_PUB_PREFIX, action, ...parts].join('|');
}

export function parseLoPubCustomId(customId: string): { action: string; parts: string[] } | null {
  if (!customId.startsWith(`${LO_PUB_PREFIX}|`)) return null;
  const segments = customId.split('|');
  return { action: segments[1] ?? '', parts: segments.slice(2) };
}

function blockQuote(text: string): string {
  return `> ${text}`;
}

async function resolveDiscordAuthor(
  client: Client | undefined,
  authorDiscordId: string,
): Promise<{ name: string; iconURL?: string }> {
  if (!client) return { name: 'Unknown' };
  const user = await client.users.fetch(authorDiscordId).catch(() => null);
  if (!user) return { name: 'Unknown' };
  return {
    name: user.displayName ?? user.username,
    iconURL: user.displayAvatarURL({ size: 128 }),
  };
}

async function buildCommunityDescription(
  doc: ICommunityLoadout | Record<string, any>,
  lang?: SupportedLanguage,
  client?: Client,
): Promise<{ description: string; author: { name: string; iconURL?: string }; profileUrl: string }> {
  const resolvedLang =
    lang ?? ((await getUserLanguage(doc.authorDiscordId)) as SupportedLanguage);

  const publicId = doc.publicId ?? String(doc._id);
  const discordAuthor = await resolveDiscordAuthor(client, doc.authorDiscordId);
  const profileUrl = `https://discord.com/users/${doc.authorDiscordId}`;
  const userLink = `[${discordAuthor.name}](${profileUrl})`;
  const fnName = doc.authorDisplayName || '—';

  const description = [
    `${translate('loadouts.community.buildName', resolvedLang)}: **"${doc.name}"**`,
    blockQuote(
      translate('loadouts.community.publishedByLine', resolvedLang, {
        user: userLink,
        fn: fnName,
      }),
    ),
    blockQuote(
      `${translate('loadouts.community.buildId', resolvedLang)}: \`${publicId}\``,
    ),
  ].join('\n');

  return { description, author: discordAuthor, profileUrl };
}

/** Legacy embed (e.g. old channel messages). Prefer V2 for new posts. */
export async function buildCommunityLoadoutEmbed(
  doc: ICommunityLoadout | Record<string, any>,
  lang?: SupportedLanguage,
  client?: Client,
): Promise<EmbedBuilder> {
  const { description, author, profileUrl } = await buildCommunityDescription(doc, lang, client);

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setAuthor({
      name: author.name,
      iconURL: author.iconURL,
      url: profileUrl,
    })
    .setDescription(description);
}

/** First media-gallery image inside Components V2 JSON (type 12 → items[].media.url). */
function mediaGalleryUrl(components: any[] | undefined): string | null {
  for (const c of components ?? []) {
    if (c?.type === 12) {
      const url = c.items?.[0]?.media?.url;
      if (url) return url;
    }
    const nested = mediaGalleryUrl(c?.components);
    if (nested) return nested;
  }
  return null;
}

export function communityImageUrlFromMessage(message: Message): string | null {
  const embedImage = message.embeds[0]?.image?.url;
  if (embedImage) return embedImage;
  const attachment = message.attachments.first()?.url;
  if (attachment) return attachment;
  // V2 posts have no embeds/attachments: the image lives in the container's media gallery.
  return mediaGalleryUrl(message.components.map((c) => c.toJSON()));
}

export async function buildCommunityV2Container(
  doc: ICommunityLoadout | Record<string, any>,
  lang: SupportedLanguage,
  client: Client | undefined,
  imageUrl: string,
): Promise<ContainerBuilder> {
  const { description, author } = await buildCommunityDescription(doc, lang, client);
  const publicId = doc.publicId ?? String(doc._id);

  const container = createV2Container('info');

  const header = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${author.name}\n${description}`),
  );
  if (author.iconURL) {
    header.setThumbnailAccessory(new ThumbnailBuilder().setURL(author.iconURL));
  }
  container.addSectionComponents(header);

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(
    await buildCommunityLoadoutButtons(publicId, lang, {
      likes: (doc.likes ?? []).length,
      dislikes: (doc.dislikes ?? []).length,
    }),
  );

  return container;
}

export async function buildCommunityLoadoutButtons(
  publicId: string,
  lang: SupportedLanguage,
  counts: { likes: number; dislikes: number } = { likes: 0, dislikes: 0 },
): Promise<ActionRowBuilder<ButtonBuilder>> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(loPubCustomId('lk', publicId))
      .setLabel(`👍 ${counts.likes}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(loPubCustomId('dk', publicId))
      .setLabel(`👎 ${counts.dislikes}`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(loPubCustomId('cl', publicId))
      .setLabel(translate('loadouts.community.cloneButton', lang))
      .setEmoji('🧬')
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildCloneSlotRows(
  publicId: string,
  slots: Array<{ guid: string; index: number; commanderDisplayName: string }>,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < slots.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const slot of slots.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(loPubCustomId('cs', publicId, slot.guid))
          .setLabel(`#${slot.index} ${slot.commanderDisplayName}`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(row);
  }
  return rows;
}

export function communityAttachmentName(publicId: string): string {
  return `loadout_${publicId.replace(/-/g, '').slice(0, 12)}.png`;
}

export async function buildCommunityMessagePayload(
  doc: ICommunityLoadout | Record<string, any>,
  publicId: string,
  imagePath: string,
  lang: SupportedLanguage,
  client?: Client,
) {
  const fileName = communityAttachmentName(publicId);
  const attachment = new AttachmentBuilder(imagePath, { name: fileName });
  const container = await buildCommunityV2Container(
    doc,
    lang,
    client,
    `attachment://${fileName}`,
  );

  return {
    embeds: [],
    components: [container.toJSON() as any],
    files: [attachment],
    flags: MessageFlags.IsComponentsV2,
  };
}
