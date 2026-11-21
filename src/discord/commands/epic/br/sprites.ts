/**
 * /sprites collection — Spirit collection image.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { buildDiscordLocalizations, getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { buildInfoReplyPayload } from '#helpers/commands/discord/info/infoEmbedHelper.ts';
import {
  replyEpicCredentialError,
  replyWithEpicEmbed,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import { log } from '#helpers/core/logger.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';

const SPRITE_COLLECTION_FILE_NAME = 'sprite-collection.webp';

type SpiritCollectionEra = 'extractable' | 'legacy';

interface SpriteCollectionSuccess {
  ok: true;
  buffer: string;
  fileName?: string;
  displayName: string;
  era: SpiritCollectionEra;
}

interface SpriteCollectionFailure {
  ok: false;
  errorKey: string;
  message: string;
}

type SpriteCollectionResult = SpriteCollectionSuccess | SpriteCollectionFailure;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sprites')
    .setDescription('View your Fortnite spirit collection')
    .setNameLocalizations(buildDiscordLocalizations('sprites.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('sprites.cmd.description'))
    .addSubcommand((sub) =>
      sub
        .setName('collection')
        .setDescription('Generate an image of your spirit collection')
        .setNameLocalizations(buildDiscordLocalizations('sprites.cmd.collection.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('sprites.cmd.collection.description'))
        .addBooleanOption((opt) =>
          opt
            .setName('legacy')
            .setDescription('Show the legacy CH7S3 collection instead of the current season')
            .setDescriptionLocalizations(buildDiscordLocalizations('sprites.cmd.collection.options.legacy.description'))
            .setRequired(false),
        ),
    )
    .setDMPermission(true),

  auth: true,
  cooldown: 30,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;

    if (interaction.options.getSubcommand() !== 'collection') return;

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const lang = await getUserLanguage(userId, locale);
    const legacy = interaction.options.getBoolean('legacy') ?? false;
    const era: SpiritCollectionEra = legacy ? 'legacy' : 'extractable';

    let result: SpriteCollectionResult;
    try {
      result = await callCoreWithTimeout<SpriteCollectionResult>(
        'sprites.collection',
        10 * 60_000,
        {
          accountId: mainAccount.accountId,
          accessToken: mainAccount.accessToken,
          displayName: mainAccount.displayName,
          lang,
          discordUserId: userId,
          era,
        },
      );
    } catch (err: unknown) {
      log.commands.error({ err }, '[sprites] Collection generation failed');
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        description: await translateForUser(userId, 'sprites.errors.renderFailed', undefined, locale),
        footerKey: 'brand',
      });
      return;
    }

    if (!result.ok) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        description: await translateForUser(userId, result.errorKey, undefined, locale),
        footerKey: 'brand',
      });
      return;
    }

    const attachment = new AttachmentBuilder(
      Buffer.from(result.buffer, 'base64'),
      { name: result.fileName || SPRITE_COLLECTION_FILE_NAME },
    );
    const authorData = await getMainAccountAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: result.displayName,
    });

    const logoPayload = await buildInfoReplyPayload(userId, { style: 'info' }, interaction, locale);
    const embed = logoPayload.embeds[0]?.data
      ? EmbedBuilder.from(logoPayload.embeds[0])
      : new EmbedBuilder();

    embed.setImage(`attachment://${attachment.name ?? SPRITE_COLLECTION_FILE_NAME}`);

    if (authorData) {
      embed.setAuthor({ name: authorData.name, iconURL: authorData.iconURL });
    }

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  },
};

export default command;
