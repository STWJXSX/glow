import { randomUUID } from 'crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import ClientSettingsBackup from '#models/ClientSettingsBackup.ts';
import { CLIENT_SETTINGS_PLATFORM_ALL, CLIENT_SETTINGS_PLATFORMS } from '#helpers/epic/fortnite/clientSettingsPlatforms.ts';
import { downloadPlatformsForBackup } from '#helpers/epic/fortnite/clientSettingsCloud.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  getEpicAuthor,
} from '../epicEmbedHelper.ts';
import { EPIC_PANEL_IDLE_MS, editReplyInactive, isCollectorIdle } from '../epicCollectorHelper.ts';
import { resolveLinkedAccount } from './cloudconfigAccounts.ts';
import { formatTransferResultLines, normalizePlatformSelection } from './formatResults.ts';

const SELECT_ID = 'cloudconfig_backup_platforms';
const CONFIRM_ID = 'cloudconfig_backup_confirm';

export async function handleCloudconfigBackup(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const accountOpt = interaction.options.getString('account');

  const resolved = await resolveLinkedAccount(userId, accountOpt);
  if ('error' in resolved) {
    if (resolved.error === 'no_accounts') {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (resolved.error === 'no_main') {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.token');
    return;
  }

  const { account } = resolved;
  let selected: string[] = [CLIENT_SETTINGS_PLATFORM_ALL];

  const author = await getEpicAuthor(userId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: account.displayName ?? account.accountId,
  });

  const buildPanel = async () => {
    const title = await translateForUser(userId, 'cloudconfig.backup.panelTitle', undefined, locale);
    const description = await translateForUser(userId, 'cloudconfig.backup.panelDescription', undefined, locale);
    const placeholder = await translateForUser(userId, 'cloudconfig.backup.selectPlaceholder', undefined, locale);
    const confirmLabel = await translateForUser(userId, 'cloudconfig.backup.confirmButton', undefined, locale);
    const allLabel = await translateForUser(userId, 'cloudconfig.autocomplete.allPlatforms', undefined, locale);

    const options: StringSelectMenuOptionBuilder[] = [
      new StringSelectMenuOptionBuilder()
        .setLabel(allLabel.slice(0, 100))
        .setValue(CLIENT_SETTINGS_PLATFORM_ALL)
        .setDefault(selected.includes(CLIENT_SETTINGS_PLATFORM_ALL)),
      ...CLIENT_SETTINGS_PLATFORMS.map((p) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(p.label.slice(0, 100))
          .setValue(p.id)
          .setDefault(selected.includes(p.id) && !selected.includes(CLIENT_SETTINGS_PLATFORM_ALL)),
      ),
    ];

    const select = new StringSelectMenuBuilder()
      .setCustomId(SELECT_ID)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options);

    const confirm = new ButtonBuilder()
      .setCustomId(CONFIRM_ID)
      .setLabel(confirmLabel.slice(0, 80))
      .setStyle(ButtonStyle.Success);

    const payload = await buildEpicReplyPayload(
      userId,
      { style: 'info', title, description, author, footerKey: 'sensitive' },
      interaction,
      locale,
    );

    return {
      ...payload,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
        new ActionRowBuilder<ButtonBuilder>().addComponents(confirm),
      ],
    };
  };

  await interaction.editReply(await buildPanel());

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    idle: EPIC_PANEL_IDLE_MS,
  });

  collector.on('collect', async (componentInteraction) => {
    if (componentInteraction.customId === SELECT_ID && componentInteraction.isStringSelectMenu()) {
      await componentInteraction.deferUpdate();
      selected = normalizePlatformSelection(componentInteraction.values);
      await interaction.editReply(await buildPanel());
      return;
    }

    if (componentInteraction.customId === CONFIRM_ID && componentInteraction.isButton()) {
      await componentInteraction.deferUpdate();
      collector.stop('confirmed');

      const platformIds = normalizePlatformSelection(selected);
      const downloads = await downloadPlatformsForBackup(
        account.accessToken,
        account.accountId,
        platformIds,
      );

      const batchId = randomUUID();
      const entries = downloads
        .filter((d): d is Extract<typeof d, { ok: true }> => d.ok && Boolean(d.data))
        .map((d) => ({
          platformId: d.platformId,
          uniqueFilename: d.uniqueFilename,
          size: d.bytes,
          data: d.data!,
          createdAt: new Date(),
        }));

      if (entries.length) {
        await ClientSettingsBackup.create({
          discordId: userId,
          accountId: account.accountId,
          displayName: account.displayName,
          batchId,
          entries,
        });
      }

      const lines = await formatTransferResultLines(
        userId,
        downloads.map(({ data: _d, ...r }) => r),
        locale,
      );
      const saved = await translateForUser(
        userId,
        'cloudconfig.backup.saved',
        { count: String(entries.length), batchId },
        locale,
      );

      await replyWithEpicEmbed(interaction, userId, {
        style: entries.length ? 'success' : 'warning',
        title: await translateForUser(userId, 'cloudconfig.backup.doneTitle', undefined, locale),
        description: `${saved}\n\n${lines}`,
        author,
        footerKey: 'sensitive',
      });
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (isCollectorIdle(reason)) {
      await editReplyInactive(interaction, userId);
    }
  });
}
