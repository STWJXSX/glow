import axios from 'axios';
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { replyAccountCredentialError } from '#helpers/commands/epic/account/accountEmbedHelper.ts';
import {
  buildInfoReplyPayload,
  replyWithInfoEmbed,
} from '#helpers/commands/discord/info/infoEmbedHelper.ts';

const logger = log.commands;

function clearMissionAlertGuids(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => clearMissionAlertGuids(item));
  }

  const newObj: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'missionAlertGuid') {
      newObj[key] = '';
    } else {
      newObj[key] = clearMissionAlertGuids(value);
    }
  }

  return newObj;
}

export async function handleWorldInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;

  try {
    const userDb = await UsuarioInfo.findOne({ id: userId });
    if (!userDb) {
      await replyAccountCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = userDb.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyAccountCredentialError(interaction, userId, 'noMain');
      return;
    }

    const account = mainAccount;

    const authorData = await getMainAccountAuthor(userId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName,
    });

    const emojiLoading = getEmoji(interaction.client, 'loading');

    await replyWithInfoEmbed(interaction, userId, {
      style: 'info',
      title: await translateForUser(userId, 'file.worldinfo.messages.loadingTitle', undefined, locale),
      description: await translateForUser(
        userId,
        'file.worldinfo.messages.loading',
        { emoji: emojiLoading },
        locale,
      ),
      author: authorData,
      footerKey: 'brand',
    });

    let res: any;
    try {
      res = await axios.get(Endpoints.STW_WORLD_INFO, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err: any) {
      await replyWithInfoEmbed(interaction, userId, {
        style: 'error',
        description: await translateForUser(userId, 'file.worldinfo.errors.fetchFailed', undefined, locale),
        author: authorData,
        footerKey: 'brand',
      });
      return;
    }

    const processedData = clearMissionAlertGuids(res.data);

    const nombreArchivo =
      interaction.options.getString('name') ||
      (await translateForUser(userId, 'file.worldinfo.defaultFileName', {
        date: new Date().toISOString().split('T')[0].replace(/-/g, '_'),
      }, locale));

    const jsonString = JSON.stringify(processedData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf8');
    const fileSizeMB = (jsonBuffer.length / (1024 * 1024)).toFixed(2);

    if (jsonBuffer.length > 25 * 1024 * 1024) {
      await replyWithInfoEmbed(interaction, userId, {
        style: 'error',
        description: await translateForUser(userId, 'file.worldinfo.errors.fileTooLarge', {
          size: fileSizeMB,
        }, locale),
        author: authorData,
        footerKey: 'brand',
      });
      return;
    }

    const attachment = new AttachmentBuilder(jsonBuffer, {
      name: `${nombreArchivo}.json`,
      description: await translateForUser(userId, 'file.worldinfo.fileDescription', undefined, locale),
    });

    const misiones = processedData.missions
      ? processedData.missions.reduce(
          (total: number, theater: any) =>
            total + (theater.availableMissions ? theater.availableMissions.length : 0),
          0,
        )
      : 0;

    const [
      successTitle,
      successDescription,
      fieldFile,
      fieldSize,
      fieldMissions,
    ] = await Promise.all([
      translateForUser(userId, 'file.worldinfo.success.title', undefined, locale),
      translateForUser(userId, 'file.worldinfo.success.description', undefined, locale),
      translateForUser(userId, 'file.worldinfo.success.fields.file', undefined, locale),
      translateForUser(userId, 'file.worldinfo.success.fields.size', undefined, locale),
      translateForUser(userId, 'file.worldinfo.success.fields.missions', undefined, locale),
    ]);

    const payload = await buildInfoReplyPayload(
      userId,
      {
        style: 'success',
        title: successTitle,
        description: successDescription,
        author: authorData,
        fields: [
          { name: fieldFile, value: `\`${nombreArchivo}.json\``, inline: true },
          { name: fieldSize, value: `${fileSizeMB} MB`, inline: true },
          { name: fieldMissions, value: misiones.toLocaleString('en-US'), inline: true },
        ],
        footerKey: 'brand',
        timestamp: true,
      },
      interaction,
      locale,
    );

    await interaction.editReply({
      embeds: payload.embeds,
      files: [...payload.files, attachment],
    });
  } catch (error: any) {
    logger.error({ error }, '[worldinfo] Error in command');
    try {
      await replyWithInfoEmbed(interaction, userId, {
        style: 'error',
        description: await translateForUser(userId, 'file.worldinfo.errors.unexpected', undefined, locale),
        footerKey: 'brand',
      });
    } catch (e) {
      logger.error({ error: e }, '[worldinfo] Error sending error embed');
    }
  }
}
