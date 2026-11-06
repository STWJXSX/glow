/**
 * Check Ban Subcommand Handler
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyWithAccountEmbed } from './accountEmbedHelper.ts';
import { fetchFortniteSanctionFlags } from '#helpers/epic/account/fortniteSanctions.ts';

export async function handleCheckBanSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) throw new Error('User not found');

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) throw new Error('Main account not found');

    const authorData = await getMainAccountAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    let commonAttributes: Record<string, unknown> | undefined;
    try {
      log.epic.info({ userId }, 'Checking ban status');
      const commonData = await composeMCP({
        profile: 'common_core',
        operation: 'QueryProfile',
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      });
      commonAttributes = commonData?.profileChanges?.[0]?.profile?.stats?.attributes as Record<string, unknown>;
    } catch (err: unknown) {
      log.epic.error({ err }, 'Error fetching common_core for ban check');
      const embed = await createGenericErrorEmbed(err, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const sanctions = await fetchFortniteSanctionFlags(
      mainAccount.accessToken,
      mainAccount.accountId,
      commonAttributes,
    );

    const hasRestriction =
      sanctions.activeSanctions
      || sanctions.fnEntitlementBan
      || sanctions.epicSocialBan
      || sanctions.fnMatchmakingBan;

    const statusLine = hasRestriction
      ? await translateForUser(userId, 'account.checkban.restricted')
      : await translateForUser(userId, 'account.checkban.notBanned');

    const yes = await translateForUser(userId, 'account.values.yes');
    const no = await translateForUser(userId, 'account.values.no');

    const yn = (ok: boolean) => (ok ? yes : no);

    const restrictionsBlock = [
      await translateForUser(userId, 'account.checkban.restrictionsHeader'),
      `> ${await translateForUser(userId, 'account.checkban.neverSanctioned')}: ${yn(!sanctions.activeSanctions)}`,
      `> ${await translateForUser(userId, 'account.checkban.fnEntitlementAccess')}: ${yn(!sanctions.fnEntitlementBan)}`,
      `> ${await translateForUser(userId, 'account.checkban.epicSocialAccess')}: ${yn(!sanctions.epicSocialBan)}`,
      `> ${await translateForUser(userId, 'account.checkban.fnMatchmakingAccess')}: ${yn(!sanctions.fnMatchmakingBan)}`,
    ].join('\n');

    const description = `${statusLine}\n\n${restrictionsBlock}`;

    await replyWithAccountEmbed(interaction, userId, {
      style: hasRestriction ? 'error' : 'success',
      title: await translateForUser(userId, 'account.checkban.title'),
      description,
      footerKey: 'brand',
      author: authorData,
    });

    log.epic.info({ userId, sanctions }, 'Ban check completed');
  } catch (error: unknown) {
    log.epic.error({ error }, 'Error handling checkban subcommand');
    const errorMsg = await translateForUser(userId, 'account.checkban.errors.unexpected');
    const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
    await interaction.editReply({ embeds: [embed] });
  }
}
