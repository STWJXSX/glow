import axios from 'axios';
import { 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  Colors,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Collection,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { getTranslations } from '#helpers/locales/index.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { EmojiHelper } from '#helpers/core/emojis.ts';
import { createAuthSession, clearAuthSession } from './authSessions.ts';
import { buildDiscordMessageUrl } from '#helpers/commands/epic/auth/authEmbedHelper.ts';
import { sendRegistrationSuccessDM, sendCredentialUpdateDM } from '../utils/dmHandler.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { resolveAccountRegistrationLimit } from '#helpers/core/client/accountLimits.ts';
import { AUTH_PROMPT_IDLE_MS } from '#helpers/commands/epic/auth/authCollectorHelper.ts';

const ANDROID_AUTH = 'Basic M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';
const LAUNCHER_AUTH = 'Basic OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3';

const GREEN = 0x57F287;

function v2Reply(container: ContainerBuilder) {
  return { components: [container] as any, flags: MessageFlags.IsComponentsV2, embeds: [] } as any;
}

function errorContainer(text: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(EMBED_COLORS.error)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

async function getAccountAvatar(accountId: string, accessToken: string): Promise<string> {
  try {
    const res = await axios.get(`${Endpoints.ACCOUNT_AVATAR}/fortnite/ids?accountIds=${accountId}`, {
      headers: { Authorization: `bearer ${accessToken}` },
    });
    
    const avatarId = Array.isArray(res.data) && res.data[0]?.avatarId ? res.data[0].avatarId : null;
    
    if (avatarId && avatarId.includes(':')) {
      const idPart = avatarId.split(':')[1];
      return `https://fortnite-api.com/images/cosmetics/br/${idPart}/smallicon.png`;
    }
  } catch (err) {
    log.epic.error({ err }, 'Error obteniendo avatar');
  }
  
  return 'https://fortnite-api.com/images/cosmetics/br/cid_890_athena_commando_f_choneheadhunter/variants/material/mat2.png';
}

/**
 * Crea embed de carga inicial
 */
export async function createLoadingEmbed(
  interaction: ChatInputCommandInteraction | ButtonInteraction
): Promise<EmbedBuilder> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  return new EmbedBuilder()
    .setColor('#FF6B35')
    .setDescription(
      (trans.authHandler?.loading?.title?.toString() || 'Starting authentication...') + '\n\n' +
      (trans.authHandler?.loading?.steps?.toString() || 'Follow the steps') + '\n\n' +
      (trans.authHandler?.loading?.waiting?.({ emoji: emoji.load }) || `${emoji.load} Waiting...`)
    )
    .setFooter({ 
      text: trans.authHandler?.loading?.footer?.toString() || 'Complete within 5 minutes'
    });
}

/**
 * Crea embed de procesando
 */
export async function createProcessingEmbed(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<EmbedBuilder> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  return new EmbedBuilder()
    .setColor('#FF6B35')
    .setDescription(
      trans.authHandler?.processing?.description?.({ emoji: emoji.load }) ||
      `${emoji.load} Processing your account...`
    );
}

/**
 * Crea embed de éxito
 */
export async function createSuccessEmbed(
  accountData: any,
  isUpdate: boolean,
  avatarUrl: string,
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<EmbedBuilder> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(
      isUpdate 
        ? (trans.authHandler?.success?.updatedTitle?.({ emoji: emoji.success }) || `${emoji.success} Updated`)
        : (trans.authHandler?.success?.registeredTitle?.({ emoji: emoji.success }) || `${emoji.success} Registered`)
    )
    .setDescription(
      isUpdate
        ? (trans.authHandler?.success?.updatedDesc?.toString() || 'Account credentials updated')
        : (trans.authHandler?.success?.registeredDesc?.toString() || 'Account registered successfully')
    )
    .addFields([
      { 
        name: `**${accountData.displayName}**`, 
        value: `> [ID] \`${accountData.accountId}\`\n`, 
        inline: false 
      },
      {
        name: isUpdate 
          ? `${emoji.change} ${trans.authHandler?.success?.authRefreshed?.toString() || 'Auth Refreshed'}`
          : trans.authHandler?.success?.accountRegistered?.toString() || 'Account Registered',
        value: `> <t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false
      }
    ])
    .setThumbnail(avatarUrl);
}

/**
 * Inicia el flujo de autenticación normal
 */
export async function startNormalAuthFlow(
  currentInteraction: ChatInputCommandInteraction | ButtonInteraction,
  originalInteraction?: ChatInputCommandInteraction
): Promise<void> {
  try {
    log.epic.info({ userId: currentInteraction.user.id }, 'Iniciando flujo normal');
    
    // Crear token con LAUNCHER
    const tokenResponse = await axios.post(
      Endpoints.OAUTH_TOKEN_CREATE,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: LAUNCHER_AUTH,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // Solicitar device authorization
    const deviceAuth = await axios.post(
      Endpoints.OAUTH_DEVICE_CODE,
      'prompt=login',
      { 
        headers: { 
          Authorization: 'bearer ' + tokenResponse.data.access_token, 
          'Content-Type': 'application/x-www-form-urlencoded' 
        } 
      }
    );

    // Mostrar interfaz de login con V2
    const emoji = new EmojiHelper(currentInteraction.client);
    const trans = await getTranslations(currentInteraction);

    const loadC = new ContainerBuilder()
      .setAccentColor(EMBED_COLORS.info)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.login} ${trans.authHandler?.loading?.easyLoginTitle?.toString() || 'Easy Login'}\n` +
            (trans.authHandler?.loading?.easyLoginWaiting?.({ emoji: emoji.load }) ||
              `${emoji.load} Waiting for you to log in...\n\nClick the button to open the Epic Games login page.`),
          ))
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(trans.authHandler?.loading?.loginButton?.toString() || 'Login to Epic Games')
              .setStyle(ButtonStyle.Link)
              .setURL(deviceAuth.data.verification_uri_complete),
          ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        trans.authHandler?.loading?.easyLoginFooter?.toString() || `-# You have 5 minutes to complete the login`,
      ));
    
    let response;
    let targetInteraction;
    
    if (currentInteraction.isButton()) {
      response = await currentInteraction.update(v2Reply(loadC));
      targetInteraction = originalInteraction || currentInteraction;
    } else {
      response = await currentInteraction.editReply(v2Reply(loadC));
      targetInteraction = currentInteraction;
    }

    // Crear sesión de autenticación con la URL del mensaje
    const replyMsg = await targetInteraction.fetchReply();
    const messageUrl =
      replyMsg.url ||
      buildDiscordMessageUrl(targetInteraction.guildId, targetInteraction.channelId, replyMsg.id);
    createAuthSession(currentInteraction.user.id, messageUrl);

    // Polling
    await pollForDeviceAuth(targetInteraction, deviceAuth.data.device_code);

  } catch (error) {
    log.epic.error({ error }, 'Error en flujo normal');
    clearAuthSession(currentInteraction.user.id);
    throw new Error('Error iniciando proceso de autorización: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Polling para obtener el token
 */
async function pollForDeviceAuth(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  deviceCode: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    
    log.epic.info('Iniciando polling para device code');
    
    const interval = setInterval(async () => {
      if (stopped) {
        clearInterval(interval);
        return;
      }
      
      try {
        // Intentar obtener token con LAUNCHER
        const tokenLauncher = await axios.post(
          Endpoints.OAUTH_TOKEN_CREATE,
          `grant_type=device_code&device_code=${deviceCode}`,
          {
            headers: {
              Authorization: LAUNCHER_AUTH,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        stopped = true;
        clearInterval(interval);
        
        log.epic.info('Token LAUNCHER obtenido, generando exchange code');

        // Obtener exchange code del token LAUNCHER
        const exchangeRes = await axios.get(
          Endpoints.OAUTH_EXCHANGE,
          {
            headers: { Authorization: `bearer ${tokenLauncher.data.access_token}` },
          }
        );

        const exchangeCode = exchangeRes.data.code;
        log.epic.info('Exchange code generado, convirtiendo a ANDROID');

        // Convertir exchange code a token ANDROID
        const tokenAndroid = await axios.post(
          Endpoints.OAUTH_TOKEN_CREATE,
          `grant_type=exchange_code&exchange_code=${exchangeCode}&token_type=eg1`,
          {
            headers: {
              Authorization: ANDROID_AUTH,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        log.epic.info('Token ANDROID obtenido, procesando registro');

        // Mostrar V2 procesando
        const emoji = new EmojiHelper(interaction.client);
        const processingC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji.load} Processing your account...`));
        await interaction.editReply(v2Reply(processingC));

        // Procesar registro con token ANDROID
        await processAccountRegistration(interaction, tokenAndroid.data);
        resolve();

      } catch (error: any) {
        if (error.response?.data?.errorCode === 'errors.com.epicgames.account.oauth.authorization_pending') {
          // Aún esperando, continuar polling
          return;
        }
        
        stopped = true;
        clearInterval(interval);
        clearAuthSession(interaction.user.id);
        
        log.epic.error({ error }, 'Error en polling');
        reject(new Error('Error durante autenticación'));
      }
    }, 11000);

    // Timeout después de 5 minutos
    setTimeout(() => {
      if (!stopped) {
        stopped = true;
        clearInterval(interval);
        clearAuthSession(interaction.user.id);
        reject(new Error('Timeout - El proceso de autenticación expiró'));
      }
    }, 300000);
  });
}

/**
 * Procesa exchange code
 */
export async function processExchangeCode(
  exchangeCode: string,
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<void> {
  try {
    log.epic.info({ userId: interaction.user.id }, 'Procesando exchange code');
    
    const payload = new URLSearchParams({
      grant_type: 'exchange_code',
      exchange_code: exchangeCode,
      token_type: 'eg1',
    }).toString();

    const tokenResponse = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, payload, {
      headers: {
        Authorization: ANDROID_AUTH,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Mostrar V2 procesando
    const emoji = new EmojiHelper(interaction.client);
    const processingC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji.load} Processing your account...`));
    await interaction.editReply(v2Reply(processingC));

    await processAccountRegistration(interaction, tokenResponse.data);

  } catch (error) {
    log.epic.error({ error }, 'Error en exchange code');
    clearAuthSession(interaction.user.id);
    throw new Error('Exchange Code inválido o expirado');
  }
}

/**
 * Procesa el registro de cuenta
 */
async function processAccountRegistration(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  tokenData: any,
  options?: { isJsonImport?: boolean }
): Promise<void> {
  try {
    log.epic.info({ displayName: tokenData.displayName }, 'Procesando registro con token ANDROID');
    const emoji = new EmojiHelper(interaction.client);
    const trans = await getTranslations(interaction);

    // Obtener device auth
    const deviceauths = await axios.post(
      `${Endpoints.OAUTH_DEVICE_AUTH}/${tokenData.account_id}/deviceAuth`,
      {},
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    const accountId = deviceauths.data.accountId;
    const deviceId = deviceauths.data.deviceId;
    const secret = deviceauths.data.secret;

    log.epic.info({ deviceId }, 'Device auth ANDROID generado');

    // Obtener avatar
    const avatarUrl = await getAccountAvatar(accountId, tokenData.access_token);

    // Buscar o crear usuario
    let user = await UsuarioInfo.findOne({ id: interaction.user.id });
    
    if (!user) {
      user = new UsuarioInfo({ 
        id: interaction.user.id, 
        aceptarTOS: true, 
        deviceAuths: [] 
      });
    }

    // Verificar si la cuenta ya existe
    const existingIndex = user.deviceAuths.findIndex((acc: any) => acc.accountId === accountId);
    const isUpdate = existingIndex !== -1;
    const isFirstAccount = !isUpdate && user.deviceAuths.length === 0;

    // Limit check for new accounts (re-checks at registration time with fresh data)
    if (!isUpdate) {
      const resolved = await resolveAccountRegistrationLimit(interaction.user.id, user.deviceAuths.length);
      const limit = resolved.max;
      if (user.deviceAuths.length >= limit) {
        const emoji = new EmojiHelper(interaction.client);
        const trans = await getTranslations(interaction);
        const graceNote = resolved.graceActive && resolved.graceUntil
          ? `\n\n⚠️ Remove **${resolved.excessAccounts}** excess account(s) before <t:${Math.floor(resolved.graceUntil.getTime() / 1000)}:R> or they will be removed randomly.`
          : '';
        const limitC = new ContainerBuilder().setAccentColor(EMBED_COLORS.error)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.error} ${trans.registrar?.embed1?.limitReached?.title?.toString() || 'Limit Reached'}
` +
            (trans.registrar?.embed1?.limitReached?.description?.({ current: user.deviceAuths.length, max: limit }) ||
              `You have reached the maximum registered accounts (**${user.deviceAuths.length}/${limit}**).`) +
            graceNote,
          ));
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(v2Reply(limitC));
        } else {
          await (interaction as any).reply({ ...v2Reply(limitC), ephemeral: true });
        }
        clearAuthSession(interaction.user.id);
        return;
      }
    }

    const accountData = {
      displayName: tokenData.displayName,
      accountId: accountId,
      deviceId: deviceId,
      secret: secret,
      accessToken: tokenData.access_token,
      expiresAt: tokenData.expires_at,
      refreshToken: tokenData.refresh_token,
      refreshExpiresAt: tokenData.refresh_expires_at,
      cuentaMain: isUpdate ? user.deviceAuths[existingIndex].cuentaMain : isFirstAccount,
    };

    if (isUpdate) {
      user.deviceAuths[existingIndex] = accountData;
      log.epic.info({ displayName: tokenData.displayName }, 'Actualizando cuenta con credenciales ANDROID');
    } else {
      user.deviceAuths.push(accountData);
      log.epic.info({ displayName: tokenData.displayName }, 'Registrando nueva cuenta ANDROID');
    }

    await user.save();

    const { clearAutomationSuspension } = await import('../automation/tokenFailurePolicy.ts');
    await clearAutomationSuspension(interaction.user.id, accountId);

    // Build success container V2
    const successC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info);

    if (isUpdate) {
      successC.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.success} ${trans.authHandler?.success?.updatedV2Title?.toString() || 'Account Updated'}\n` +
            `**${tokenData.displayName}**\n` +
            `\`${accountId}\`\n\n` +
            (trans.authHandler?.success?.updatedV2Desc?.({ time: `<t:${Math.floor(Date.now() / 1000)}:R>` }) ||
              `${emoji.change} Credentials refreshed <t:${Math.floor(Date.now() / 1000)}:R>`),
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
      );
    } else if (isFirstAccount) {
      // First account -> auto main, welcome message
      successC.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.success} ${trans.authHandler?.success?.welcome?.toString() || 'Welcome!'}\n` +
            (trans.authHandler?.success?.welcomeDesc?.({ displayName: tokenData.displayName, accountId }) ||
              `**${tokenData.displayName}** has been registered as your **main account**.\n\`${accountId}\``),
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        trans.authHandler?.success?.welcomeFeatures?.({ emoji: emoji.join }) ||
        `> ${emoji.join} You can now use all bot features!\n> Use \`/account\` to manage your accounts.\n-# Your credentials have been sent via DM`,
      ));
    } else {
      // Not first, not update -> offer "Set as Main" button (unless JSON import)
      successC.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${trans.authHandler?.success?.registeredTitle?.({ emoji: emoji.success }) || `${emoji.success} Account Registered`}\n` +
            `**${tokenData.displayName}**\n` +
            `\`${accountId}\``,
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
      );

      if (!options?.isJsonImport) {
        successC.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              trans.authHandler?.success?.setAsMainQuestion?.toString() || `-# Want this as your main account?`,
            ))
            .setButtonAccessory(
              new ButtonBuilder()
                .setCustomId(`set_main_${accountId}`)
                .setLabel(trans.authHandler?.success?.setAsMainButton?.toString() || 'Set as Main')
                .setStyle(ButtonStyle.Secondary),
            ),
        );
      }
    }

    const enjoyFooter = trans.authHandler?.success?.enjoyFooter?.toString();
    if (enjoyFooter) {
      successC
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(enjoyFooter));
    }

    if (interaction.replied || interaction.deferred) {
      const msg = await interaction.editReply(v2Reply(successC));

      // Listen for "Set as Main" button if applicable
      if (!isUpdate && !isFirstAccount && !options?.isJsonImport) {
        try {
          const collector = msg.createMessageComponentCollector({
            filter: (i) =>
              i.isButton() &&
              i.user.id === interaction.user.id &&
              i.customId === `set_main_${accountId}`,
            idle: AUTH_PROMPT_IDLE_MS,
            max: 1,
          });
          collector.on('collect', async (btn: ButtonInteraction) => {
            try {
              const freshUser = await UsuarioInfo.findOne({ id: interaction.user.id });
              if (freshUser) {
                freshUser.deviceAuths.forEach((acc: any) => { acc.cuentaMain = acc.accountId === accountId; });
                await freshUser.save();
              }
              const doneC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
                .addSectionComponents(
                  new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                      `## ${emoji.success} ${trans.authHandler?.success?.mainSetTitle?.toString() || 'Main Account Set'}\n` +
                      (trans.authHandler?.success?.mainSetDesc?.({ displayName: tokenData.displayName }) ||
                        `**${tokenData.displayName}** is now your main account.`),
                    ))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
                );
              await btn.update(v2Reply(doneC));
            } catch (err) { log.epic.error({ err }, 'Error setting main'); }
          });
          collector.on('end', async (col: Collection<string, ButtonInteraction>) => {
            if (col.size === 0) {
              // Remove the "set as main" button after timeout
              const timeoutC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
                .addSectionComponents(
                  new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                      `## ${trans.authHandler?.success?.registeredTitle?.({ emoji: emoji.success }) || `${emoji.success} Account Registered`}\n**${tokenData.displayName}**\n\`${accountId}\``,
                    ))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
                );
              try { await interaction.editReply(v2Reply(timeoutC)); } catch {}
            }
          });
        } catch {}
      }
    } else {
      await interaction.reply(v2Reply(successC));
    }

    // Send DM
    try {
      const discordUser = interaction.user;
      if (isUpdate) {
        await sendCredentialUpdateDM(discordUser, accountData, interaction);
      } else {
        await sendRegistrationSuccessDM(discordUser, accountData, interaction);
      }
    } catch (dmError) {
      log.epic.warn({ error: dmError }, 'No se pudo enviar DM al usuario');
    }

    // Limpiar sesión
    clearAuthSession(interaction.user.id);

    // Background duplicate detection
    runBackgroundDuplicateCheck(interaction, accountId, tokenData.displayName).catch(err =>
      log.epic.error({ err }, 'Error in background duplicate check')
    );

    log.epic.info({ displayName: tokenData.displayName }, 'Registro completado');

  } catch (error) {
    log.epic.error({ error }, 'Error procesando registro');
    clearAuthSession(interaction.user.id);
    throw new Error('Error procesando el registro de la cuenta');
  }
}

/**
 * Background duplicate check: finds other users with the same accountId and deregisters + notifies
 */
async function runBackgroundDuplicateCheck(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  accountId: string,
  displayName: string,
): Promise<void> {
  const currentUserId = interaction.user.id;
  const emoji = new EmojiHelper(interaction.client);

  const duplicates = await UsuarioInfo.find({
    'deviceAuths.accountId': accountId,
    id: { $ne: currentUserId },
  });

  for (const dup of duplicates) {
    // Remove the account from their list
    dup.deviceAuths = dup.deviceAuths.filter((acc: any) => acc.accountId !== accountId) as any;
    await dup.save();

    log.epic.info({ duplicateUserId: dup.id, accountId }, 'Removed duplicate account from another user');

    // Notify via DM
    try {
      const dupUser = await interaction.client.users.fetch(dup.id);
      const transForDup = await getTranslations(interaction);
      const dmC = new ContainerBuilder().setAccentColor(EMBED_COLORS.error)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `## ${emoji.warning} ${transForDup.authHandler?.duplicate?.removedTitle?.toString() || 'Account Removed'}\n` +
          (transForDup.authHandler?.duplicate?.removedDesc?.({ displayName, accountId }) ||
            `The account **${displayName}** (\`${accountId}\`) has been registered by another user.\n` +
            `It has been removed from your account list.\n\n` +
            `-# If you didn't authorize this, re-register the account with /login`),
        ));
      await dupUser.send(v2Reply(dmC));
    } catch (dmErr) {
      log.epic.warn({ err: dmErr, duplicateUserId: dup.id }, 'Could not DM duplicate user');
    }
  }
}

interface GlowJsonAccount {
  accountId: string;
  displayName: string;
  deviceId: string;
  secret: string;
  isMain?: boolean;
  addedAt?: number;
}

/**
 * Importa cuentas desde un JSON de exportación de Glow
 */
export async function processGlowJsonImport(
  accounts: GlowJsonAccount[],
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  maxLimit: number = 256,
): Promise<{ imported: number; updated: number; skipped: number }> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  let user = await UsuarioInfo.findOne({ id: interaction.user.id });
  if (!user) {
    user = new UsuarioInfo({
      id: interaction.user.id,
      aceptarTOS: true,
      deviceAuths: [],
    });
  }

  for (const account of accounts) {
    if (!account.accountId || !account.deviceId || !account.secret) {
      skipped++;
      continue;
    }

    if (user.deviceAuths.length >= maxLimit) {
      skipped += accounts.length - imported - updated - skipped;
      break;
    }

    const existingIndex = user.deviceAuths.findIndex((acc: any) => acc.accountId === account.accountId);
    const isUpdate = existingIndex !== -1;

    const accountData = {
      displayName: account.displayName || 'Unknown',
      accountId: account.accountId,
      deviceId: account.deviceId,
      secret: account.secret,
      accessToken: '',
      expiresAt: null,
      refreshToken: null,
      refreshExpiresAt: null,
      cuentaMain: false,
    };

    if (isUpdate) {
      user.deviceAuths[existingIndex] = accountData;
      updated++;
    } else {
      user.deviceAuths.push(accountData);
      imported++;
    }
  }

  await user.save();

  log.epic.info({ userId: interaction.user.id, imported, updated, skipped }, 'Glow JSON import completado');

  // Background duplicate check for all imported/updated accounts
  const allAccountIds = accounts
    .filter(a => a.accountId && a.deviceId && a.secret)
    .map(a => ({ accountId: a.accountId, displayName: a.displayName || 'Unknown' }));
  
  for (const { accountId, displayName } of allAccountIds) {
    runBackgroundDuplicateCheck(interaction, accountId, displayName).catch(err =>
      log.epic.error({ err, accountId }, 'Error in background duplicate check for JSON import')
    );
  }

  return { imported, updated, skipped };
}

/**
 * Procesa authorization code (login con código)
 */
export async function processAuthorizationCode(
  authCode: string,
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<void> {
  try {
    log.epic.info({ userId: interaction.user.id }, 'Procesando authorization code');

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      token_type: 'eg1',
    }).toString();

    const tokenResponse = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, payload, {
      headers: {
        Authorization: ANDROID_AUTH,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const emoji = new EmojiHelper(interaction.client);
    const processingC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji.load} Processing your account...`));
    await interaction.editReply(v2Reply(processingC));

    await processAccountRegistration(interaction, tokenResponse.data);

  } catch (error) {
    log.epic.error({ error }, 'Error en authorization code');
    clearAuthSession(interaction.user.id);
    throw new Error('Authorization Code inválido o expirado');
  }
}

/**
 * Procesa device auth manual (accountId + deviceId + secret)
 */
export async function processDeviceAuthManual(
  accountId: string,
  deviceId: string,
  secret: string,
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<void> {
  try {
    log.epic.info({ userId: interaction.user.id, accountId }, 'Procesando device auth manual');
    const emoji = new EmojiHelper(interaction.client);
    const trans = await getTranslations(interaction);

    const processingC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        trans.authHandler?.processing?.validating?.({ emoji: emoji.load }) ||
        `${emoji.load} Validating credentials...`
      ));
    await interaction.editReply(v2Reply(processingC));

    // Authenticate using the provided device auth credentials
    const payload = new URLSearchParams({
      grant_type: 'device_auth',
      account_id: accountId,
      device_id: deviceId,
      secret: secret,
      token_type: 'eg1',
    }).toString();

    const tokenResponse = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, payload, {
      headers: {
        Authorization: ANDROID_AUTH,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenData = tokenResponse.data;

    // Get avatar
    const avatarUrl = await getAccountAvatar(tokenData.account_id, tokenData.access_token);

    // Save directly (we already have the device auth, no need to create a new one)
    let user = await UsuarioInfo.findOne({ id: interaction.user.id });
    if (!user) {
      user = new UsuarioInfo({ id: interaction.user.id, aceptarTOS: true, deviceAuths: [] });
    }

    const existingIndex = user.deviceAuths.findIndex((acc: any) => acc.accountId === tokenData.account_id);
    const isUpdate = existingIndex !== -1;
    const isFirstAccount = !isUpdate && user.deviceAuths.length === 0;

    // Limit check for new accounts (re-checks at registration time with fresh data)
    if (!isUpdate) {
      const resolved = await resolveAccountRegistrationLimit(interaction.user.id, user.deviceAuths.length);
      const limit = resolved.max;
      if (user.deviceAuths.length >= limit) {
        const trans = await getTranslations(interaction);
        const graceNote = resolved.graceActive && resolved.graceUntil
          ? `\n\n⚠️ Remove **${resolved.excessAccounts}** excess account(s) before <t:${Math.floor(resolved.graceUntil.getTime() / 1000)}:R> or they will be removed randomly.`
          : '';
        const limitC = new ContainerBuilder().setAccentColor(EMBED_COLORS.error)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.error} ${trans.registrar?.embed1?.limitReached?.title?.toString() || 'Limit Reached'}
` +
            (trans.registrar?.embed1?.limitReached?.description?.({ current: user.deviceAuths.length, max: limit }) ||
              `You have reached the maximum registered accounts (**${user.deviceAuths.length}/${limit}**).`) +
            graceNote,
          ));
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(v2Reply(limitC));
        } else {
          await (interaction as any).reply({ ...v2Reply(limitC), ephemeral: true });
        }
        clearAuthSession(interaction.user.id);
        return;
      }
    }

    const accountData = {
      displayName: tokenData.displayName,
      accountId: tokenData.account_id,
      deviceId: deviceId,
      secret: secret,
      accessToken: tokenData.access_token,
      expiresAt: tokenData.expires_at,
      refreshToken: tokenData.refresh_token,
      refreshExpiresAt: tokenData.refresh_expires_at,
      cuentaMain: isUpdate ? user.deviceAuths[existingIndex].cuentaMain : isFirstAccount,
    };

    if (isUpdate) {
      user.deviceAuths[existingIndex] = accountData;
    } else {
      user.deviceAuths.push(accountData);
    }
    await user.save();

    // Build V2 success response
    const successC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info);

    if (isUpdate) {
      successC.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.success} ${trans.authHandler?.success?.updatedV2Title?.toString() || 'Account Updated'}\n` +
            `**${tokenData.displayName}**\n\`${tokenData.account_id}\`\n\n` +
            (trans.authHandler?.success?.updatedV2Desc?.({ time: `<t:${Math.floor(Date.now() / 1000)}:R>` }) ||
              `${emoji.change} Credentials refreshed <t:${Math.floor(Date.now() / 1000)}:R>`),
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
      );
    } else if (isFirstAccount) {
      successC.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${emoji.success} ${trans.authHandler?.success?.welcome?.toString() || 'Welcome!'}\n` +
            (trans.authHandler?.success?.welcomeDesc?.({ displayName: tokenData.displayName, accountId: tokenData.account_id }) ||
              `**${tokenData.displayName}** has been registered as your **main account**.\n\`${tokenData.account_id}\``),
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        trans.authHandler?.success?.welcomeFeatures?.({ emoji: emoji.join }) ||
        `> ${emoji.join} You can now use all bot features!\n> Use \`/account\` to manage your accounts.\n-# Your credentials have been sent via DM`,
      ));
    } else {
      successC.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${trans.authHandler?.success?.registeredTitle?.({ emoji: emoji.success }) || `${emoji.success} Account Registered`}\n` +
            `**${tokenData.displayName}**\n\`${tokenData.account_id}\``,
          ))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            trans.authHandler?.success?.setAsMainQuestion?.toString() || `-# Want this as your main account?`
          ))
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`set_main_${tokenData.account_id}`)
              .setLabel(trans.authHandler?.success?.setAsMainButton?.toString() || 'Set as Main')
              .setStyle(ButtonStyle.Secondary),
          ),
      );
    }

    const msg = await interaction.editReply(v2Reply(successC));

    // Listen for "Set as Main" if applicable
    if (!isUpdate && !isFirstAccount) {
      try {
        const collector = msg.createMessageComponentCollector({
          filter: (i) =>
            i.isButton() &&
            i.user.id === interaction.user.id &&
            i.customId === `set_main_${tokenData.account_id}`,
          idle: AUTH_PROMPT_IDLE_MS,
          max: 1,
        });
        collector.on('collect', async (btn: ButtonInteraction) => {
          try {
            const freshUser = await UsuarioInfo.findOne({ id: interaction.user.id });
            if (freshUser) {
              freshUser.deviceAuths.forEach((acc: any) => { acc.cuentaMain = acc.accountId === tokenData.account_id; });
              await freshUser.save();
            }
            const doneC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
              .addSectionComponents(new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                  `## ${emoji.success} Main Account Set\n**${tokenData.displayName}** is now your main account.`,
                ))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
              );
            await btn.update(v2Reply(doneC));
          } catch (err) { log.epic.error({ err }, 'Error setting main'); }
        });
        collector.on('end', async (col: Collection<string, ButtonInteraction>) => {
          if (col.size === 0) {
            const timeoutC = new ContainerBuilder().setAccentColor(EMBED_COLORS.info)
              .addSectionComponents(new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                  `## ${emoji.success} Account Registered\n**${tokenData.displayName}**\n\`${tokenData.account_id}\``,
                ))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
              );
            try { await interaction.editReply(v2Reply(timeoutC)); } catch {}
          }
        });
      } catch {}
    }

    // DM
    try {
      if (isUpdate) {
        await sendCredentialUpdateDM(interaction.user, accountData, interaction);
      } else {
        await sendRegistrationSuccessDM(interaction.user, accountData, interaction);
      }
    } catch {}

    clearAuthSession(interaction.user.id);

    // Background duplicate check
    runBackgroundDuplicateCheck(interaction, tokenData.account_id, tokenData.displayName).catch(err =>
      log.epic.error({ err }, 'Error in background duplicate check')
    );

  } catch (error: any) {
    log.epic.error({ error }, 'Error en device auth manual');
    clearAuthSession(interaction.user.id);
    throw new Error('Device Auth credentials are invalid or expired');
  }
}
