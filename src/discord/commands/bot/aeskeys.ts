/**
 * COMANDO /AES-KEYS
 * Exports merged Fortnite AES keys as JSON.
 */

import { AttachmentBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { replyWithInfoEmbed } from '#helpers/commands/discord/info/infoEmbedHelper.ts';
import {
  fetchMergedAesKeys,
  serializeMergedAesPayload,
} from '#helpers/epic/fortnite/aesKeysService.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';

const logger = log.commands;
const FILE_NAME = 'fortnite-aes-keys.json';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('aes-keys')
    .setDescription('Export current Fortnite AES keys as JSON')
    .setNameLocalizations(buildDiscordLocalizations('aeskeys.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('aeskeys.cmd.description'))
    .setDMPermission(true),

  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;

    try {
      const payload = await fetchMergedAesKeys();
      const json = serializeMergedAesPayload(payload);
      const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: FILE_NAME });

      await replyWithInfoEmbed(
        interaction,
        userId,
        {
          style: 'success',
          title: await translateForUser(userId, 'aeskeys.success', undefined, locale),
          description: await translateForUser(userId, 'aeskeys.successDetail', {
            build: payload.build ?? payload.version ?? '—',
            count: String(payload.dynamicKeys.length),
          }, locale),
          footerKey: 'brand',
        },
        { files: [attachment] },
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ error: error.message }, '[AES-KEYS] Fetch error');
      const embed = await generarEmbedError('api', { apiError: error, client: interaction.client, interaction });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
