import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, DiscordAPIError, EmbedBuilder, escapeMarkdown, RESTJSONErrorCodes } from 'discord.js';
import type { ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { fetchChannelWithGuild } from '#helpers/core/fetchChannel.ts';
import { resolveGlowDataDir } from '#helpers/core/glowAssetPaths.ts';

const COMMANDS_DOC_CHANNEL_ID = process.env.COMMANDS_DOC_CHANNEL_ID?.trim() || '1573658571231600723';
const COMMANDS_DOC_FOOTER = 'Glow · in-game commands';
export const FNCHAT_ACTIVATE_BUTTON_ID = 'glow_fnchat_activate';

const COMMAND_DOCS: Array<[name: string, description: string]> = [
  ['vbucks', 'see daily V-Bucks alerts'],
  ['vbucks bulk', 'check pending alerts across linked accounts by DM; use `!vbucks bulk 2` for the next page'],
  ['loadout 3', 'equip hero preset 3; use `!loadout` to list your presets'],
  ['llamas', 'open every llama on the account at once'],
  ['outpost', 'view everyone with permissions in your SSD'],
  ['skip', 'skip the STW tutorial'],
  ['weekly', 'view weekly quests and reroll'],
];

function buildCommandsEmbed(avatarUrl: string, botName?: string): EmbedBuilder {
  const list = COMMAND_DOCS.map(([name, desc]) => `• \`!${name}\` · ${desc}`).join('\n');
  const recipient = botName ? `**${escapeMarkdown(botName)}**` : 'the Epic friend shown in your confirmation';

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle('Glow in Fortnite')
    .setThumbnail(avatarUrl)
    .setDescription(
      'Use Glow commands from Fortnite chat.\n\n'
      + '**1.** Press **Enable Fortnite chat** and select your linked Epic account.\n'
      + `**2.** Open **Chats** in Fortnite and message ${recipient}. Try \`!vbucks\` to start.\n\n`
      + '-# Requires Glow Premium and a linked Epic account.',
    )
    .addFields(
      { name: 'Available commands', value: list },
      {
        name: 'Use another linked account',
        value: '`!weekly --accmain` · Your main account\n'
          + '`!weekly --accYourDisplayName` · The matching Epic display name',
      },
    )
    .setFooter({ text: COMMANDS_DOC_FOOTER });
}

/** Publishes the in-game commands guide and updates the same message on later starts. */
export async function updateCommandsDoc(
  client: ExtendedClient,
  identity?: { name?: string; accountId?: string },
): Promise<void> {
  const bot = client.user;
  if (!bot) return;

  const channel = await fetchChannelWithGuild(client, COMMANDS_DOC_CHANNEL_ID);
  if (channel?.type !== ChannelType.GuildText) {
    log.bot.warn({ channelId: COMMANDS_DOC_CHANNEL_ID }, '[CommandsDoc] Text channel unavailable');
    return;
  }

  const statePath = resolveGlowDataDir('commands-doc', `${channel.id}-${bot.id}.txt`);
  const messageId = await readFile(statePath, 'utf8').then((id) => id.trim()).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
    return '';
  });
  const button = new ButtonBuilder()
    .setCustomId(FNCHAT_ACTIVATE_BUTTON_ID)
    .setLabel('Enable Fortnite chat')
    .setStyle(ButtonStyle.Primary);
  const payload = {
    embeds: [buildCommandsEmbed(bot.displayAvatarURL({ size: 128 }), identity?.name)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    allowedMentions: { parse: [] },
  };

  if (messageId) {
    try {
      await channel.messages.edit(messageId, payload);
      log.bot.info({ channelId: channel.id, messageId }, '[CommandsDoc] Guide updated');
      return;
    } catch (err) {
      if (!(err instanceof DiscordAPIError) || err.code !== RESTJSONErrorCodes.UnknownMessage) throw err;
    }
  }

  // Recover a previous send if the process stopped before saving its message ID.
  const recent = await channel.messages.fetch({ limit: 50 });
  const existing = recent.find((message) =>
    message.author.id === bot.id && message.embeds.some((embed) => embed.footer?.text === COMMANDS_DOC_FOOTER),
  );
  await mkdir(dirname(statePath), { recursive: true });
  const message = existing
    ? await existing.edit(payload)
    : await channel.send({ ...payload, nonce: `docs-${channel.id}`, enforceNonce: true });
  await writeFile(statePath, message.id, 'utf8');
  log.bot.info({ channelId: channel.id, messageId: message.id }, '[CommandsDoc] Guide synced');
}
