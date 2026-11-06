import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type Client,
} from 'discord.js';
import { createV2Container } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { SUPPORTED_LANGUAGES } from '#helpers/locales/languages.ts';
import { PANEL_VERSIONS, syncChannelPanels } from '../guild/panelSync.ts';
import { TICKET_TRANSLATIONS, type TicketLang, type TicketTranslation } from './ticketTranslations.ts';

/** Support ticket panel channel (#support). */
export const TICKET_PANEL_CHANNEL_ID = '1444045152363483278';

/** Max language sections per message (Discord hard cap: 40 nested components). */
const TICKET_PANEL_LANGS_PER_MESSAGE = 6;

function addTicketLanguageSection(container: ContainerBuilder, lang: TicketLang, t: TicketTranslation): void {
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${t.flag} ${t.label}**\n-# ${t.panelDescription}`),
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`ticket_lang_${lang}`)
          .setLabel(t.panelButton)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(t.flag),
      ),
  );
}

export function buildTicketPanelMessages(botAvatar: string, headerEmoji: string): ContainerBuilder[][] {
  const langChunks: TicketLang[][] = [];
  for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += TICKET_PANEL_LANGS_PER_MESSAGE) {
    langChunks.push(SUPPORTED_LANGUAGES.slice(i, i + TICKET_PANEL_LANGS_PER_MESSAGE) as TicketLang[]);
  }

  const messages: ContainerBuilder[][] = [];

  const header = createV2Container('success');
  header.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${headerEmoji} Support / Soporte`,
        ),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar)),
  );
  header.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  for (const lang of langChunks[0] ?? []) {
    addTicketLanguageSection(header, lang, TICKET_TRANSLATIONS[lang]);
  }
  messages.push([header]);

  for (const chunk of langChunks.slice(1)) {
    const continuation = createV2Container('success');
    for (const lang of chunk) {
      addTicketLanguageSection(continuation, lang, TICKET_TRANSLATIONS[lang]);
    }
    messages.push([continuation]);
  }

  return messages;
}

export async function syncSupportTicketPanel(client: Client): Promise<void> {
  if (!client.user) return;

  const channel = await client.channels.fetch(TICKET_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return;

  const botAvatar = client.user.displayAvatarURL({ size: 256 });
  const headerEmoji = getEmoji(client, 'discord');

  await syncChannelPanels({
    channel: channel as never,
    clientUserId: client.user.id,
    version: PANEL_VERSIONS.support,
    logTag: 'SUPPORT_PANEL',
    buildMessages: () => buildTicketPanelMessages(botAvatar, headerEmoji),
  });
}
