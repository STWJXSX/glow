import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { callCore } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, buildLocalizedChoices, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

export const data = new SlashCommandBuilder()
  .setName('spoof')
  .setDescription('Modifies STW stats shown in lobby')
  .setNameLocalizations(buildDiscordLocalizations('spoof.cmd.name'))
  .setDescriptionLocalizations(buildDiscordLocalizations('spoof.cmd._1'))
  .addStringOption(option =>
    option.setName('level')
      .setDescription('Type of statistics to display')
      .setNameLocalizations(buildDiscordLocalizations('spoof.cmd.options.level.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('spoof.cmd._2'))
      .setRequired(true)
      .addChoices(
        ...buildLocalizedChoices('spoof.cmd.choices', [
          { value: 'alto' },
          { value: 'bajo' },
        ]),
      )
  )
  .setDMPermission(true);

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const nivel = interaction.options.getString('level', true);

  try {
    const user = await UsuarioInfo.findOne({ id: userId });

    if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);

    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    await callCore('spoof.apply', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      level: nivel,
    });

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      description: await translateForUser(userId, 'spoof.success.applied', undefined, interaction.locale),
      author,
      timestamp: true,
    }, interaction);

    await interaction.editReply(payload);

  } catch (error: any) {
    log.epic.error({ error: error.message, stack: error.stack }, 'Error en comando spoof');

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        description: await translateForUser(userId, 'spoof.errors.partyNotFound', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicCustomError(interaction, userId, 'spoof.errors.applyingSpoof');
  }
}

export const auth = true;
export const prem = true;
export const stw = true;
