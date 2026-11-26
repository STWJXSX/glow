import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  Collection,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  FileUploadBuilder,
  LabelBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { createGenericErrorEmbed, EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import {
  checkTOSAccepted,
  createTOSEmbed,
  createTOSButtons,
  handleTOSAcceptance,
  createCancelEmbed,
  createTimeoutEmbed,
} from '#helpers/epic/auth/tosHandler.ts';
import {
  startNormalAuthFlow,
  processExchangeCode,
  processGlowJsonImport,
  processAuthorizationCode,
  processDeviceAuthManual,
} from '#helpers/epic/auth/authHandler.ts';
import { EPIC_LOGIN_FIELDS, EPIC_LOGIN_URLS } from '#helpers/epic/auth/epicLoginUrls.ts';
import { getAuthSession, clearAuthSession, type AuthSession } from '#helpers/epic/auth/authSessions.ts';
import { resolveAccountRegistrationLimit } from '#helpers/core/client/accountLimits.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  appendAuthCredit,
  authBlock,
  authCreditLine,
  authQuoteBlock,
  authV2Container,
  authV2Reply,
  isValidDiscordMessageUrl,
} from '#helpers/commands/epic/auth/authEmbedHelper.ts';
import {
  AUTH_FLOW_IDLE_MS,
  isCollectorIdle,
} from '#helpers/commands/epic/auth/authCollectorHelper.ts';

function errorContainer(text: string): ContainerBuilder {
  return authV2Container('error', text);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('Link your Epic Games account to Glow')
    .setNameLocalizations(buildDiscordLocalizations('login.slash.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('login.slash.description'))
    .addStringOption((option) =>
      option
        .setName('method')
        .setNameLocalizations(buildDiscordLocalizations('login.slash.method.name'))
        .setDescription('How do you want to sign in?')
        .setDescriptionLocalizations(buildDiscordLocalizations('login.slash.method.description'))
        .setRequired(false)
        .addChoices(
          { name: 'Easy login', value: 'normal', name_localizations: buildDiscordLocalizations('login.slash.method.choices.normal') },
          { name: 'Authorization code', value: 'authcode', name_localizations: buildDiscordLocalizations('login.slash.method.choices.authcode') },
          { name: 'Device code', value: 'devicecode', name_localizations: buildDiscordLocalizations('login.slash.method.choices.devicecode') },
          { name: 'Exchange code', value: 'exchange', name_localizations: buildDiscordLocalizations('login.slash.method.choices.exchange') },
          { name: 'Device auth (manual)', value: 'deviceauth', name_localizations: buildDiscordLocalizations('login.slash.method.choices.deviceauth') },
          { name: 'Glow JSON import', value: 'glowjson', name_localizations: buildDiscordLocalizations('login.slash.method.choices.glowjson') },
        ),
    ) as SlashCommandBuilder,

  cooldown: 5,
  auth: false,
  nodefer: true,
  onlyslash: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;

    try {
      const metodo = interaction.options.getString('method') || 'normal';

      const activeSession = getAuthSession(userId);
      if (activeSession) {
        await handleActiveSession(interaction, activeSession, metodo);
        return;
      }

      await proceedWithLogin(interaction, metodo);
    } catch (error) {
      log.epic.error({ error }, 'Error general en login');
      const embed = await createGenericErrorEmbed(
        {
          message: await translateForUser(
            userId,
            'login.errors.generalError',
            { error: (error as Error).message },
            interaction.locale,
          ),
        },
        interaction,
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [embed], components: [] });
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } catch {
        /* ignore */
      }
    }
  },
};

async function handleActiveSession(
  interaction: ChatInputCommandInteraction,
  activeSession: AuthSession,
  metodo: string,
): Promise<void> {
  const userId = interaction.user.id;

  const title = await translateForUser(userId, 'login.activeSession.title', undefined, interaction.locale);
  const body = await translateForUser(userId, 'login.activeSession.body', undefined, interaction.locale);
  const footer = await translateForUser(userId, 'login.activeSession.footer', undefined, interaction.locale);
  const goLabel = await translateForUser(userId, 'login.activeSession.goToSession', undefined, interaction.locale);
  const forceLabel = await translateForUser(userId, 'login.activeSession.forceLogin', undefined, interaction.locale);

  const content = authBlock(title, `${authQuoteBlock(body)}\n\n-# ${footer}`);
  const container = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.warning)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  const credit = await authCreditLine(userId, interaction.locale);
  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(credit));

  const buttons: ButtonBuilder[] = [];
  if (isValidDiscordMessageUrl(activeSession.messageUrl)) {
    buttons.push(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(goLabel).setURL(activeSession.messageUrl),
    );
  }
  buttons.push(
    new ButtonBuilder().setCustomId('login_force_new').setLabel(forceLabel).setStyle(ButtonStyle.Secondary),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  const response = await interaction.reply({
    ...authV2Reply(container, [row]),
    ephemeral: true,
    fetchReply: true,
  });

  const collector = response.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === 'login_force_new',
    idle: AUTH_FLOW_IDLE_MS,
    max: 1,
  });

  collector.on('collect', async (btn: ButtonInteraction) => {
    clearAuthSession(userId);
    await btn.deferUpdate();
    await proceedWithLogin(interaction, metodo);
  });

  collector.on('end', async (_col, reason) => {
    if (reason === 'collect') return;
    if (isCollectorIdle(reason)) {
      try {
        await interaction.editReply({ components: [], embeds: [] });
      } catch {
        /* ignore */
      }
    }
  });
}

async function proceedWithLogin(
  interaction: ChatInputCommandInteraction,
  metodo: string,
): Promise<void> {
  const userId = interaction.user.id;
  const tosAccepted = await checkTOSAccepted(userId);

  if (!tosAccepted) {
    log.epic.info({ userId }, 'Usuario no ha aceptado TOS');
    await showTOSFlow(interaction, metodo);
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const user = await UsuarioInfo.findOne({ id: userId });
  await continueWithRegistration(interaction, metodo, user, null);
}

async function showTOSFlow(
  interaction: ChatInputCommandInteraction,
  metodo: string,
): Promise<void> {
  const userId = interaction.user.id;
  const tosEmbed = await createTOSEmbed(interaction);
  const tosButtons = await createTOSButtons(interaction);
  const payload = { embeds: [tosEmbed], components: [tosButtons] };

  const response =
    interaction.replied || interaction.deferred
      ? await interaction.editReply(payload)
      : await interaction.reply({ ...payload, ephemeral: true, fetchReply: true });

  const filter = (i: ButtonInteraction) =>
    i.user.id === userId && (i.customId === 'tos_accept' || i.customId === 'tos_cancel');
  const collector = response.createMessageComponentCollector({
    filter: filter as never,
    idle: AUTH_FLOW_IDLE_MS,
  });

  collector.on('collect', async (i: ButtonInteraction) => {
    if (i.customId === 'tos_accept') {
      const result = await handleTOSAcceptance(userId);
      if (result.success) {
        await i.deferUpdate();
        const user = await UsuarioInfo.findOne({ id: userId });
        await continueWithRegistration(interaction, metodo, user, i);
      } else {
        const embed = await createGenericErrorEmbed(
          { message: await translateForUser(userId, 'login.errors.tosSaveFailed', undefined, interaction.locale) },
          interaction,
        );
        await i.update({ embeds: [embed], components: [] });
      }
      collector.stop('done');
    } else if (i.customId === 'tos_cancel') {
      const cancelEmbed = await createCancelEmbed(interaction);
      await i.update({ embeds: [cancelEmbed], components: [] });
      collector.stop('done');
    }
  });

  collector.on('end', async (collected: Collection<string, ButtonInteraction>, reason) => {
    if (reason === 'done') return;
    if (isCollectorIdle(reason) || collected.size === 0) {
      try {
        const te = await createTimeoutEmbed(interaction);
        await interaction.editReply({ embeds: [te], components: [] });
      } catch {
        /* ignore */
      }
    }
  });
}

async function continueWithRegistration(
  currentInteraction: ChatInputCommandInteraction,
  metodo: string,
  user: { deviceAuths?: unknown[] } | null,
  originalInteraction: ButtonInteraction | null,
): Promise<void> {
  try {
    const userId = currentInteraction.user.id;
    const currentCount = user?.deviceAuths?.length ?? 0;
    const resolved = await resolveAccountRegistrationLimit(userId, currentCount);
    const maxAccounts = resolved.max;

    if (currentCount >= maxAccounts) {
      const premiumEmoji = getEmoji(currentInteraction.client, 'premium');
      const premiumPrefix = premiumEmoji ? `${premiumEmoji} ` : '';
      const graceNote = resolved.graceActive && resolved.graceUntil
        ? `\n\n⚠️ You have **${resolved.excessAccounts}** excess account(s). Remove them before <t:${Math.floor(resolved.graceUntil.getTime() / 1000)}:R> or the bot will remove them randomly.`
        : '';
      const body = await appendAuthCredit(
        userId,
        authBlock(
          await translateForUser(userId, 'login.limitReached.title', undefined, currentInteraction.locale),
          [
            await translateForUser(userId, 'login.limitReached.description', { current: currentCount, max: maxAccounts }, currentInteraction.locale),
            graceNote,
            '',
            `${premiumPrefix}${await translateForUser(userId, 'login.limitReached.premiumNote', undefined, currentInteraction.locale)}`,
            `-# ${await translateForUser(userId, 'login.limitReached.footer', undefined, currentInteraction.locale)}`,
          ].join('\n'),
        ),
        currentInteraction,
      );
      const container = authV2Container('error', body);

      if (originalInteraction?.isButton()) {
        await originalInteraction.update(authV2Reply(container));
      } else {
        await currentInteraction.editReply(authV2Reply(container));
      }
      return;
    }

    switch (metodo) {
      case 'exchange':
        return handleExchangeMethod(currentInteraction, originalInteraction);
      case 'authcode':
        return handleAuthCodeMethod(currentInteraction, originalInteraction);
      case 'devicecode':
        return handleDeviceCodeMethod(currentInteraction, originalInteraction);
      case 'deviceauth':
        return handleDeviceAuthMethod(currentInteraction, originalInteraction);
      case 'glowjson':
        return handleGlowJsonMethod(currentInteraction, originalInteraction);
      default:
        return startNormalAuthFlow(currentInteraction, originalInteraction as never);
    }
  } catch (error) {
    log.epic.error({ error }, 'Error continuando registro');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(currentInteraction.user.id, 'login.errors.generalError', undefined, currentInteraction.locale) },
      currentInteraction,
    );
    try {
      if (originalInteraction?.isButton()) {
        await originalInteraction.update({ embeds: [embed], components: [] });
      } else {
        await currentInteraction.editReply({ embeds: [embed], components: [] });
      }
    } catch {
      /* ignore */
    }
  }
}

async function handleExchangeMethod(
  currentInteraction: ChatInputCommandInteraction,
  originalInteraction: ButtonInteraction | null,
): Promise<void> {
  const userId = currentInteraction.user.id;

  const title = await translateForUser(userId, 'login.methods.exchange.title', undefined, currentInteraction.locale);
  const desc = await translateForUser(userId, 'login.methods.exchange.description', undefined, currentInteraction.locale);
  const enterCode = await translateForUser(userId, 'login.methods.exchange.enterCode', undefined, currentInteraction.locale);
  const openPage = await translateForUser(userId, 'login.methods.exchange.openPage', undefined, currentInteraction.locale);
  const note = await translateForUser(
    userId,
    'login.methods.exchange.note',
    { field: EPIC_LOGIN_FIELDS.exchangeCode },
    currentInteraction.locale,
  );

  const c = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(authBlock(title, authQuoteBlock(desc))))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('exchange_modal')
            .setLabel(enterCode)
            .setStyle(ButtonStyle.Primary),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(note))
        .setButtonAccessory(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(openPage)
            .setURL(EPIC_LOGIN_URLS.exchange),
        ),
    );

  const credit = await authCreditLine(userId, currentInteraction.locale);
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(credit));

  const response = originalInteraction?.isButton()
    ? await originalInteraction.update(authV2Reply(c))
    : await currentInteraction.editReply(authV2Reply(c));

  const collector = response.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === 'exchange_modal',
    idle: AUTH_FLOW_IDLE_MS,
  });

  collector.on('collect', async (i: ButtonInteraction) => {
    const modalTitle = await translateForUser(userId, 'login.methods.exchange.modalTitle', undefined, currentInteraction.locale);
    const inputLabel = await translateForUser(userId, 'login.methods.exchange.inputLabel', undefined, currentInteraction.locale);
    const placeholder = await translateForUser(userId, 'login.methods.exchange.inputPlaceholder', undefined, currentInteraction.locale);

    const modal = new ModalBuilder()
      .setCustomId('exchange_submit')
      .setTitle(modalTitle)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('exchange_code_input')
            .setLabel(inputLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(placeholder),
        ),
      );
    await i.showModal(modal);
    try {
      const sub = await i.awaitModalSubmit({
        filter: (m: ModalSubmitInteraction) => m.user.id === userId,
        time: 120_000,
      });
      const code = sub.fields.getTextInputValue('exchange_code_input').trim();
      if (!code) {
        const invalid = await translateForUser(userId, 'login.methods.exchange.invalid', undefined, currentInteraction.locale);
        await sub.reply({ ...authV2Reply(errorContainer(invalid)), ephemeral: true });
        return;
      }
      await sub.deferUpdate();
      await processExchangeCode(code, sub);
    } catch (err) {
      if (!(err as Error).message?.includes('time')) log.epic.error({ err }, 'Error en exchange modal');
    }
  });

  collector.on('end', async (col: Collection<string, ButtonInteraction>, reason) => {
    if (reason === 'done') return;
    if (isCollectorIdle(reason) || col.size === 0) {
      try {
        await currentInteraction.editReply({ components: [], embeds: [] });
      } catch {
        /* ignore */
      }
    }
  });
}

async function handleAuthCodeMethod(
  currentInteraction: ChatInputCommandInteraction,
  originalInteraction: ButtonInteraction | null,
): Promise<void> {
  const userId = currentInteraction.user.id;

  const title = await translateForUser(userId, 'login.methods.authcode.title', undefined, currentInteraction.locale);
  const desc = await translateForUser(userId, 'login.methods.authcode.description', undefined, currentInteraction.locale);
  const enterCode = await translateForUser(userId, 'login.methods.authcode.enterCode', undefined, currentInteraction.locale);
  const openPage = await translateForUser(userId, 'login.methods.authcode.openPage', undefined, currentInteraction.locale);
  const note = await translateForUser(
    userId,
    'login.methods.authcode.note',
    { field: EPIC_LOGIN_FIELDS.authorizationCode, enterCode },
    currentInteraction.locale,
  );

  const c = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(authBlock(title, authQuoteBlock(desc))))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('authcode_modal')
            .setLabel(enterCode)
            .setStyle(ButtonStyle.Primary),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(note))
        .setButtonAccessory(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(openPage)
            .setURL(EPIC_LOGIN_URLS.authRedirect),
        ),
    );

  const credit = await authCreditLine(userId, currentInteraction.locale);
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(credit));

  const response = originalInteraction?.isButton()
    ? await originalInteraction.update(authV2Reply(c))
    : await currentInteraction.editReply(authV2Reply(c));

  const collector = response.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === 'authcode_modal',
    idle: AUTH_FLOW_IDLE_MS,
  });

  collector.on('collect', async (i: ButtonInteraction) => {
    const modalTitle = await translateForUser(userId, 'login.methods.authcode.modalTitle', undefined, currentInteraction.locale);
    const inputLabel = await translateForUser(userId, 'login.methods.authcode.inputLabel', undefined, currentInteraction.locale);
    const placeholder = await translateForUser(userId, 'login.methods.authcode.inputPlaceholder', undefined, currentInteraction.locale);

    const modal = new ModalBuilder()
      .setCustomId('authcode_submit')
      .setTitle(modalTitle)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('authcode_input')
            .setLabel(inputLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(placeholder),
        ),
      );
    await i.showModal(modal);
    try {
      const sub = await i.awaitModalSubmit({
        filter: (m: ModalSubmitInteraction) => m.user.id === userId,
        time: 120_000,
      });
      const code = sub.fields.getTextInputValue('authcode_input').trim();
      if (!code) {
        const invalid = await translateForUser(userId, 'login.methods.authcode.invalid', undefined, currentInteraction.locale);
        await sub.reply({ ...authV2Reply(errorContainer(invalid)), ephemeral: true });
        return;
      }
      await sub.deferUpdate();
      await processAuthorizationCode(code, sub);
    } catch (err) {
      if (!(err as Error).message?.includes('time')) log.epic.error({ err }, 'Error en authcode modal');
    }
  });

  collector.on('end', async (col: Collection<string, ButtonInteraction>, reason) => {
    if (reason === 'done') return;
    if (isCollectorIdle(reason) || col.size === 0) {
      try {
        await currentInteraction.editReply({ components: [], embeds: [] });
      } catch {
        /* ignore */
      }
    }
  });
}

async function handleDeviceCodeMethod(
  currentInteraction: ChatInputCommandInteraction,
  originalInteraction: ButtonInteraction | null,
): Promise<void> {
  await startNormalAuthFlow(currentInteraction, originalInteraction as never);
}

async function handleDeviceAuthMethod(
  currentInteraction: ChatInputCommandInteraction,
  originalInteraction: ButtonInteraction | null,
): Promise<void> {
  const userId = currentInteraction.user.id;

  const title = await translateForUser(userId, 'login.methods.deviceauth.title', undefined, currentInteraction.locale);
  const desc = await translateForUser(userId, 'login.methods.deviceauth.description', undefined, currentInteraction.locale);
  const note = await translateForUser(userId, 'login.methods.deviceauth.note', undefined, currentInteraction.locale);
  const enterCredentials = await translateForUser(userId, 'login.methods.deviceauth.enterCredentials', undefined, currentInteraction.locale);

  const c = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(authBlock(title, authQuoteBlock(desc))))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('deviceauth_modal')
            .setLabel(enterCredentials)
            .setStyle(ButtonStyle.Primary),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(note));

  const credit = await authCreditLine(userId, currentInteraction.locale);
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(credit));

  const response = originalInteraction?.isButton()
    ? await originalInteraction.update(authV2Reply(c))
    : await currentInteraction.editReply(authV2Reply(c));

  const collector = response.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === 'deviceauth_modal',
    idle: AUTH_FLOW_IDLE_MS,
  });

  collector.on('collect', async (i: ButtonInteraction) => {
    const modalTitle = await translateForUser(userId, 'login.methods.deviceauth.modalTitle', undefined, currentInteraction.locale);
    const accountIdLabel = await translateForUser(userId, 'login.methods.deviceauth.fields.accountId', undefined, currentInteraction.locale);
    const deviceIdLabel = await translateForUser(userId, 'login.methods.deviceauth.fields.deviceId', undefined, currentInteraction.locale);
    const secretLabel = await translateForUser(userId, 'login.methods.deviceauth.fields.secret', undefined, currentInteraction.locale);
    const accountIdPh = await translateForUser(userId, 'login.methods.deviceauth.placeholders.accountId', undefined, currentInteraction.locale);
    const deviceIdPh = await translateForUser(userId, 'login.methods.deviceauth.placeholders.deviceId', undefined, currentInteraction.locale);
    const secretPh = await translateForUser(userId, 'login.methods.deviceauth.placeholders.secret', undefined, currentInteraction.locale);

    const modal = new ModalBuilder()
      .setCustomId('deviceauth_submit')
      .setTitle(modalTitle)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('da_account_id')
            .setLabel(accountIdLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(accountIdPh),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('da_device_id')
            .setLabel(deviceIdLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(deviceIdPh),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('da_secret')
            .setLabel(secretLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(secretPh),
        ),
      );
    await i.showModal(modal);
    try {
      const sub = await i.awaitModalSubmit({
        filter: (m: ModalSubmitInteraction) => m.user.id === userId,
        time: 120_000,
      });
      const accountId = sub.fields.getTextInputValue('da_account_id').trim();
      const deviceId = sub.fields.getTextInputValue('da_device_id').trim();
      const secret = sub.fields.getTextInputValue('da_secret').trim();
      if (!accountId || !deviceId || !secret) {
        const msg = await translateForUser(userId, 'login.errors.allFieldsRequired', undefined, currentInteraction.locale);
        await sub.reply({ ...authV2Reply(errorContainer(msg)), ephemeral: true });
        return;
      }
      await sub.deferUpdate();
      await processDeviceAuthManual(accountId, deviceId, secret, sub);
    } catch (err) {
      if (!(err as Error).message?.includes('time')) log.epic.error({ err }, 'Error en deviceauth modal');
    }
  });

  collector.on('end', async (col: Collection<string, ButtonInteraction>, reason) => {
    if (reason === 'done') return;
    if (isCollectorIdle(reason) || col.size === 0) {
      try {
        await currentInteraction.editReply({ components: [], embeds: [] });
      } catch {
        /* ignore */
      }
    }
  });
}

async function handleGlowJsonMethod(
  currentInteraction: ChatInputCommandInteraction,
  originalInteraction: ButtonInteraction | null,
): Promise<void> {
  const userId = currentInteraction.user.id;
  const premiumEmoji = getEmoji(currentInteraction.client, 'premium');
  const premiumPrefix = premiumEmoji ? `${premiumEmoji} ` : '';

  const title = await translateForUser(userId, 'login.methods.glowjson.title', undefined, currentInteraction.locale);
  const desc = await translateForUser(userId, 'login.methods.glowjson.description', undefined, currentInteraction.locale);
  const note = await translateForUser(userId, 'login.methods.glowjson.note', undefined, currentInteraction.locale);
  const selectFile = await translateForUser(userId, 'login.methods.glowjson.selectFile', undefined, currentInteraction.locale);

  const c = new ContainerBuilder()
    .setAccentColor(EMBED_COLORS.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${premiumPrefix}${title}\n${authQuoteBlock(desc)}`))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('glowjson_open_modal')
            .setLabel(selectFile)
            .setStyle(ButtonStyle.Primary),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(note));

  const credit = await authCreditLine(userId, currentInteraction.locale);
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(credit));

  const response = originalInteraction?.isButton()
    ? await originalInteraction.update(authV2Reply(c))
    : await currentInteraction.editReply(authV2Reply(c));

  const collector = response.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === 'glowjson_open_modal',
    idle: AUTH_FLOW_IDLE_MS,
  });

  collector.on('collect', async (btn: ButtonInteraction) => {
    const modalTitle = await translateForUser(userId, 'login.methods.glowjson.modalTitle', undefined, currentInteraction.locale);
    const fileLabel = await translateForUser(userId, 'login.methods.glowjson.fileLabel', undefined, currentInteraction.locale);

    const fileUpload = new FileUploadBuilder().setCustomId('glowjson_file').setRequired(true);
    const label = new LabelBuilder().setLabel(fileLabel).setFileUploadComponent(fileUpload);
    const modal = new ModalBuilder().setCustomId('glowjson_modal').setTitle(modalTitle);
    (modal as ModalBuilder & { addLabelComponents: (c: LabelBuilder) => void }).addLabelComponents(label);
    await btn.showModal(modal);

    try {
      const sub = await btn.awaitModalSubmit({
        filter: (m: ModalSubmitInteraction) => m.user.id === userId,
        time: 120_000,
      });
      const attachments = (sub.fields as unknown as { getUploadedFiles: (id: string, required: boolean) => Collection<string, { name?: string; url: string }> })
        .getUploadedFiles('glowjson_file', false);

      if (!attachments || attachments.size === 0) {
        const msg = await translateForUser(userId, 'login.methods.glowjson.noFile', undefined, currentInteraction.locale);
        await sub.reply({ ...authV2Reply(errorContainer(msg)), ephemeral: true });
        return;
      }

      const file = attachments.first()!;
      if (!file.name?.endsWith('.json')) {
        const msg = await translateForUser(userId, 'login.methods.glowjson.wrongFormat', { name: file.name ?? 'unknown' }, currentInteraction.locale);
        await sub.reply({ ...authV2Reply(errorContainer(msg)), ephemeral: true });
        return;
      }
      await sub.deferUpdate();

      const loadEmoji = getEmoji(currentInteraction.client, 'load');
      const importing = await translateForUser(userId, 'login.methods.glowjson.importing', undefined, currentInteraction.locale);
      const loadC = authV2Container('info', `${loadEmoji} ${importing}`);
      await currentInteraction.editReply(authV2Reply(loadC));

      const fileRes = await fetch(file.url);
      const text = await fileRes.text();
      let parsed: { accounts?: unknown[] };
      try {
        parsed = JSON.parse(text);
      } catch {
        const msg = await translateForUser(userId, 'login.methods.glowjson.invalidJson', undefined, currentInteraction.locale);
        await currentInteraction.editReply(authV2Reply(errorContainer(msg)));
        return;
      }
      if (!parsed.accounts || !Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
        const msg = await translateForUser(userId, 'login.methods.glowjson.noAccountsArray', undefined, currentInteraction.locale);
        await currentInteraction.editReply(authV2Reply(errorContainer(msg)));
        return;
      }

      const userInfo = await UsuarioInfo.findOne({ id: userId });
      const currentCount = userInfo?.deviceAuths?.length ?? 0;
      const resolved = await resolveAccountRegistrationLimit(userId, currentCount);
      const maxAccounts = resolved.max;
      const result = await processGlowJsonImport(parsed.accounts as never, currentInteraction, maxAccounts);

      const successEmoji = getEmoji(currentInteraction.client, 'success');
      const successTitle = await translateForUser(userId, 'login.methods.glowjson.successTitle', undefined, currentInteraction.locale);
      const successDesc = await translateForUser(
        userId,
        'login.methods.glowjson.successDesc',
        { imported: result.imported, updated: result.updated, skipped: result.skipped },
        currentInteraction.locale,
      );
      const successBody = await appendAuthCredit(
        userId,
        authBlock(`${successEmoji} ${successTitle}`, successDesc),
        currentInteraction,
      );
      await currentInteraction.editReply(authV2Reply(authV2Container('success', successBody)));
      collector.stop('done');
    } catch (err: unknown) {
      if ((err as Error)?.message?.includes('time')) return;
      log.epic.error({ err }, 'Error en Glow JSON modal');
      try {
        const errEmoji = getEmoji(currentInteraction.client, 'error');
        await currentInteraction.editReply(authV2Reply(errorContainer(`${errEmoji} ${(err as Error).message}`)));
      } catch {
        /* ignore */
      }
    }
  });

  collector.on('end', async (_col, reason: string) => {
    if (reason === 'done') return;
    if (isCollectorIdle(reason)) {
      try {
        await currentInteraction.editReply({ components: [], embeds: [] });
      } catch {
        /* ignore */
      }
    }
  });
}

export default command;
