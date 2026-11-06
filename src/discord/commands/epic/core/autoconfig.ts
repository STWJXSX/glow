import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { translateForUser, translate, getUserLanguage, buildDiscordLocalizations } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getEmoji, getPremiumEmojiName, getEmojiButtonComponent, EMOJI_IDS } from '#helpers/core/emojis.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { resolvePremiumAccess, isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';
import {
  autoconfigRequiresPremium,
  automationPremiumEmojiTier,
  AUTOMATION_SYSTEMS,
  canAccessAutomationSystem,
  getAutomationConfigByPanel,
} from '#helpers/epic/automation/config.ts';
import type { AutoconfigPanelKey } from '#helpers/epic/automation/autoconfigStatus.ts';
import { plainAccountEntry } from '#helpers/epic/automation/accountEntry.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';

// Models
import UsuarioInfo from '#models/UsuarioInfo.ts';
import AutoKick from '#models/AutoKick.ts';
import AutoSAC from '#models/AutoSAC.ts';
import AutoDaily from '#models/AutoDaily.ts';
import StatusFortnite from '#models/StatusFortnite.ts';
import AutoExpediciones from '#models/AutoExpediciones.ts';
import AutoSecuritySystem from '#models/AutoSecuritySystem.ts';
import AutoBuyFreeItems from '#models/AutoBuyFreeItems.ts';
import AutoBuySelectedItems from '#models/AutoBuySelectedItems.ts';
import Reminder from '#models/Reminder.ts';
import AutoReroll from '#models/AutoReroll.ts';
import AutoAcceptFriends from '#models/AutoAcceptFriends.ts';
import AutoRecycle from '#models/AutoRecycle.ts';
import type { IRecycleCategoryConfig } from '#models/AutoRecycle.ts';
import AutoBuySTW from '#models/AutoBuySTW.ts';
import AutoPurgeFriends from '#models/AutoPurgeFriends.ts';
import AutoLoadout from '#models/AutoLoadout.ts';
import { ALL_BUYABLE_KEYS, getBuyableItemLabel, ITEM_EMOJI_MAP } from '#helpers/epic/stw/stwBuyableItems.ts';
import { getAppEmojiByName } from '#helpers/core/emojis.ts';
import { callCore } from '#api/glowCore.ts';
import type { IAccountSecuritySnapshot } from '#helpers/epic/automation/autoSecurity/types.ts';
import AutoSurvivors from '#models/AutoSurvivors.ts';
import AutoFreeLlamas from '#models/AutoFreeLlamas.ts';
import AutoFriendAlerts from '#models/AutoFriendAlerts.ts';

type SystemKey = AutoconfigPanelKey;
type PremiumAccess = {
  paidTierLevel: number;
  canUsePremiumCommands: boolean;
};

function canUseSystem(system: SystemKey, access: PremiumAccess): boolean {
  return canAccessAutomationSystem(
    access.paidTierLevel,
    access.canUsePremiumCommands,
    system,
  );
}

function getSystemMinTierEmojiName(systemKey: SystemKey): keyof typeof EMOJI_IDS | null {
  if (isPremiumCheckBypassed()) return null;
  const emojiTier = automationPremiumEmojiTier(getAutomationConfigByPanel(systemKey).requiredTier);
  if (!emojiTier) return null;
  return getPremiumEmojiName(emojiTier);
}

async function applyAutoSACSilently(
  discordId: string,
  accountId: string,
  sacCode: string
): Promise<void> {
  try {
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo) {
      log.commands.warn(
        { discordId, accountId },
        '[AUTOCONFIG] AutoSAC immediate apply skipped: user info not found'
      );
      return;
    }

    const { account, error } = await refreshAccountToken(userInfo, accountId);
    if (!account) {
      log.commands.warn(
        { discordId, accountId, error },
        '[AUTOCONFIG] AutoSAC immediate apply skipped: token refresh failed'
      );
      return;
    }

    await composeMCP({
      profile: 'common_core',
      operation: 'SetAffiliateName',
      accountId: account.accountId,
      accessToken: account.accessToken,
      body: { affiliateName: sacCode },
    });

    log.commands.info(
      { discordId, accountId, sacCode },
      '[AUTOCONFIG] AutoSAC applied immediately after activation'
    );
  } catch (error: any) {
    log.commands.warn(
      {
        discordId,
        accountId,
        sacCode,
        error: error?.message || error?.errorData?.errorMessage || 'Unknown error',
      },
      '[AUTOCONFIG] AutoSAC immediate apply failed'
    );
  }
}

function systemName(key: SystemKey, lang: SupportedLanguage): string {
  return translate(`autoconfig.systems.${key}.name`, lang);
}

const DISCORD_BUTTON_LABEL_MAX = 80;

function buttonLabel(name: string): string {
  return name.length <= DISCORD_BUTTON_LABEL_MAX ? name : `${name.slice(0, DISCORD_BUTTON_LABEL_MAX - 1)}…`;
}


/**
 * Comando AutoConfig - Panel de configuración de sistemas automáticos
 */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autoconfig')
    .setDescription('Configure all automatic systems for your main account')
    .setNameLocalizations(buildDiscordLocalizations('autoconfig.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('autoconfig.cmd._1')),

  cooldown: 10,
  auth: true,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const discordId = interaction.user.id;
      
      // Obtener cuenta principal del usuario
      const userInfo = await UsuarioInfo.findOne({ id: discordId });
      if (!userInfo || !userInfo.deviceAuths || userInfo.deviceAuths.length === 0) {
        const errorMsg = await translateForUser(discordId, 'errors.no_account_found');
        await replyError(interaction, errorMsg);
        return;
      }

      const mainAccount = userInfo.deviceAuths.find((acc: any) => acc.cuentaMain);
      if (!mainAccount) {
        const errorMsg = await translateForUser(discordId, 'errors.no_main_account');
        await replyError(interaction, errorMsg);
        return;
      }

      let premiumAccess: PremiumAccess = { paidTierLevel: 0, canUsePremiumCommands: false };

      if (isPremiumCheckBypassed()) {
        premiumAccess = { paidTierLevel: 3, canUsePremiumCommands: true };
      } else {
        const access = await resolvePremiumAccess(discordId, interaction.client);
        premiumAccess = {
          paidTierLevel: access.paidTierLevel,
          canUsePremiumCommands: access.canUsePremiumCommands,
        };
      }

      await showMainPanel(interaction, mainAccount, premiumAccess);

    } catch (error: any) {
      log.commands.error({ command: 'autoconfig', error: error.message }, 'Error en autoconfig');
      await replyError(interaction, error.message || 'Unexpected error.').catch(() => {});
    }
  },
};

export default command;

// ==================== FUNCIONES AUXILIARES ====================

/**
 * Edits the interaction reply as a V2 container.
 * Explicitly passes embeds:[] to clear any legacy deferred loading embed before
 * setting IS_COMPONENTS_V2, which Discord otherwise rejects.
 */
async function replyV2(interaction: ChatInputCommandInteraction, containers: ContainerBuilder[]): Promise<void> {
  await interaction.editReply({
    embeds: [],
    components: containers.map(c => c.toJSON() as any),
    flags: MessageFlags.IsComponentsV2,
  } as any);
}

type AutoconfigPanelPayload = {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
};

async function replyPanel(interaction: ChatInputCommandInteraction, payload: AutoconfigPanelPayload): Promise<void> {
  await interaction.editReply({
    content: null,
    embeds: [payload.embed],
    components: payload.components,
  });
}

/**
 * Sends a red error container via V2.
 */
async function replyError(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  const emojiError = getEmoji(interaction.client, 'error');
  const errContainer = new ContainerBuilder()
    .setAccentColor(0xFF0000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojiError} ${message}`));
  await replyV2(interaction, [errContainer]);
}

/**
 * Builds the autoconfig embed (author + system list + disclaimer) and button rows outside the embed.
 */
async function buildPanel(
  interaction: ChatInputCommandInteraction,
  mainAccount: any,
  premiumAccess: PremiumAccess,
  systemsStatus: Record<SystemKey, boolean>,
  disabled = false,
  loadingSystem: SystemKey | null = null
): Promise<AutoconfigPanelPayload> {
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;
  const emojiActive = getEmoji(interaction.client, 'active');
  const emojiInactive = getEmoji(interaction.client, 'inactive');
  const emojiLoading = getEmoji(interaction.client, 'loading');

  const authorData = await getMainAccountAuthor(interaction.user.id);
  const accountName = authorData ? authorData.name : mainAccount.displayName;

  const lines: string[] = [];
  const buttons: ButtonBuilder[] = [];

  for (const { panelKey: typedSystemKey } of AUTOMATION_SYSTEMS) {
    const isActive = systemsStatus[typedSystemKey];
    const needsPremium = !canUseSystem(typedSystemKey, premiumAccess);
    const isLoading = typedSystemKey === loadingSystem;
    const additionalInfo = await getSystemAdditionalInfo(
      interaction,
      interaction.user.id,
      mainAccount.accountId,
      typedSystemKey,
      systemsStatus
    );

    // Status line
    const tierEmojiKey = autoconfigRequiresPremium(typedSystemKey)
      ? getSystemMinTierEmojiName(typedSystemKey)
      : null;
    const tierEmoji = tierEmojiKey ? getEmoji(interaction.client, tierEmojiKey) : '';
    const premiumBadge = tierEmoji ? `${tierEmoji} ` : '';
    const name = systemName(typedSystemKey, lang);
    const label = buttonLabel(name);
    if (isLoading) {
      lines.push(`${premiumBadge}${emojiLoading} **${name}**${additionalInfo}`);
    } else {
      const statusEmoji = isActive ? emojiActive : emojiInactive;
      lines.push(`${premiumBadge}${statusEmoji} **${name}**${additionalInfo}`);
    }

    // Button
    if (isLoading) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`loading_${typedSystemKey}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
    } else {
      const btn = new ButtonBuilder()
        .setCustomId(isActive ? `deactivate_${typedSystemKey}` : `activate_${typedSystemKey}`)
        .setLabel(label)
        .setStyle(needsPremium ? ButtonStyle.Secondary : (isActive ? ButtonStyle.Success : ButtonStyle.Danger))
        .setDisabled(needsPremium || disabled);
      if (tierEmojiKey) {
        const btnEmoji = getEmojiButtonComponent(tierEmojiKey);
        if (btnEmoji) btn.setEmoji(btnEmoji);
      }
      buttons.push(btn);
    }
  }

  const warningEmoji = getEmoji(interaction.client, 'warning');
  const disclaimer = translate('autoconfig.panelDisclaimer', lang);
  const description = `${lines.join('\n')}\n\n${warningEmoji} ${disclaimer}`;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setDescription(description);

  if (authorData?.iconURL) {
    embed.setAuthor({ name: authorData.name, iconURL: authorData.iconURL });
  } else {
    embed.setAuthor({ name: accountName });
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)),
    );
  }
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('bulksync_all')
        .setLabel(translate('autoconfig.bulkSync.button', lang))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    ),
  );

  return { embed, components };
}

/**
 * Muestra el panel principal de configuración
 */
async function showMainPanel(
  interaction: ChatInputCommandInteraction,
  mainAccount: any,
  premiumAccess: PremiumAccess
): Promise<void> {
  const systemsStatus = await checkAllSystemsStatus(interaction.user.id, mainAccount.accountId);
  const panel = await buildPanel(interaction, mainAccount, premiumAccess, systemsStatus);
  await replyPanel(interaction, panel);

  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutos
  });

  collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      const btnLang: SupportedLanguage = await getUserLanguage(buttonInteraction.user.id) as SupportedLanguage;
      await buttonInteraction.reply({
        content: `${getEmoji(buttonInteraction.client, 'error')} ${translate('autoconfig.errors.onlyAuthor', btnLang)}`,
        ephemeral: true,
      });
      return;
    }

    await handleButtonInteraction(buttonInteraction, mainAccount, premiumAccess, interaction);
  });

  collector.on('end', async () => {
    try {
      const finalStatus = await checkAllSystemsStatus(interaction.user.id, mainAccount.accountId);
      const disabledPanel = await buildPanel(interaction, mainAccount, premiumAccess, finalStatus, true);
      await replyPanel(interaction, disabledPanel);
    } catch {}
  });
}

/**
 * Actualiza el panel principal con nuevo estado
 */
async function updateMainPanel(
  interaction: ChatInputCommandInteraction,
  mainAccount: any,
  premiumAccess: PremiumAccess,
  changedSystem: SystemKey,
  newStatus: boolean
): Promise<void> {
  const systemsStatus = await checkAllSystemsStatus(interaction.user.id, mainAccount.accountId);
  systemsStatus[changedSystem] = newStatus;
  const panel = await buildPanel(interaction, mainAccount, premiumAccess, systemsStatus);
  await replyPanel(interaction, panel);
}

/**
 * Verifica el estado de todos los sistemas
 */
async function checkAllSystemsStatus(
  discordId: string,
  accountId: string
): Promise<Record<SystemKey, boolean>> {
  const status: Record<string, boolean> = {};

  try {
    // AutoKick
    const autoKick = await AutoKick.findOne({ discordId });
    status.autokick = autoKick?.accounts?.get(accountId)?.isActive || false;

    // AutoSAC
    const autoSAC = await AutoSAC.findOne({ discordId });
    status.autosac = autoSAC?.accounts?.get(accountId)?.isActive || false;

    // AutoDaily
    const autoDaily = await AutoDaily.findOne({ discordId });
    status.autodaily = autoDaily?.accounts?.get(accountId)?.isActive || false;

    // Status
    const statusFn = await StatusFortnite.findOne({ discordId, accountId });
    status.status = statusFn?.activo || false;

    // AutoExpediciones
    const autoExp = await AutoExpediciones.findOne({ discordId });
    status.autoexpediciones = autoExp?.accounts?.get(accountId)?.isActive || false;

    // AutoSecurity
    const autoSec = await AutoSecuritySystem.findOne({ discordId });
    status.autosecurity = autoSec?.accounts?.get(accountId)?.isActive || false;

    // AutoBuyFreeItems (key is accountId, same as other models)
    const autoBuy = await AutoBuyFreeItems.findOne({ discordId });
    status.autobuyfreeitems = autoBuy?.accounts?.get(accountId)?.isActive || false;

    // AutoBuySelectedItems
    const autoBuySel = await AutoBuySelectedItems.findOne({ discordId });
    status.autobuyselected = autoBuySel?.accounts?.get(accountId)?.isActive || false;

    // Reminder
    const reminderDoc = await Reminder.findOne({ discordId });
    status.reminder = reminderDoc?.accounts?.get(accountId)?.isActive || false;

    // AutoReroll
    const autoReroll = await AutoReroll.findOne({ discordId });
    status.autoreroll = autoReroll?.accounts?.get(accountId)?.isActive || false;

    // AutoAcceptFriends
    const autoAcceptFriends = await AutoAcceptFriends.findOne({ discordId });
    status.autoacceptfriends = autoAcceptFriends?.accounts?.get(accountId)?.isActive || false;

    // AutoRecycle
    const autoRecycle = await AutoRecycle.findOne({ discordId });
    status.autorecycle = autoRecycle?.accounts?.get(accountId)?.isActive || false;

    // AutoBuySTW
    const autoBuySTW = await AutoBuySTW.findOne({ discordId });
    status.autobuystw = autoBuySTW?.accounts?.get(accountId)?.isActive || false;

    // AutoPurgeFriends
    const autoPurgeFriends = await AutoPurgeFriends.findOne({ discordId });
    status.autopurgefriends = autoPurgeFriends?.accounts?.get(accountId)?.isActive || false;

    // AutoLoadout
    const autoLoadout = await AutoLoadout.findOne({ discordId });
    status.autoloadout = autoLoadout?.accounts?.get(accountId)?.isActive || false;

    // AutoSurvivors
    const autoSurvivors = await AutoSurvivors.findOne({ discordId });
    status.autosurvivors = autoSurvivors?.accounts?.get(accountId)?.isActive || false;

    // AutoFreeLlamas
    const autoFreeLlamas = await AutoFreeLlamas.findOne({ discordId });
    status.autofreellamas = autoFreeLlamas?.accounts?.get(accountId)?.isActive || false;

    // AutoFriendAlerts
    const autoFriendAlerts = await AutoFriendAlerts.findOne({ discordId });
    status.autofriendalerts = autoFriendAlerts?.accounts?.get(accountId)?.isActive || false;

  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error verificando estados');
  }
  return status as Record<SystemKey, boolean>;
}

/**
 * Obtiene información adicional para mostrar en el panel
 */
async function getSystemAdditionalInfo(
  interaction: ChatInputCommandInteraction,
  discordId: string,
  accountId: string,
  systemKey: SystemKey,
  systemsStatus: Record<SystemKey, boolean>
): Promise<string> {
  if (!systemsStatus[systemKey]) return '';
  
  try {
    switch(systemKey) {
      case 'autosac': {
        const autoSAC = await AutoSAC.findOne({ discordId });
        const code = autoSAC?.accounts?.get(accountId)?.sacToSet;
        return code ? ` (${code})` : '';
      }
      case 'status': {
        const statusFn = await StatusFortnite.findOne({ discordId, accountId });
        const message = statusFn?.mensaje;
        return message ? ` (${message.substring(0, 20)}...)` : '';
      }
      case 'autopurgefriends': {
        const purgeFriendsDoc = await AutoPurgeFriends.findOne({ discordId });
        const purgeData = purgeFriendsDoc?.accounts?.get(accountId);
        const wlCount = purgeData?.whitelist?.length ?? 0;
        const infoLang: SupportedLanguage = await getUserLanguage(discordId) as SupportedLanguage;
        return translate('autoconfig.additionalInfo.autopurgefriends', infoLang, { count: String(wlCount) });
      }
      default:
        return '';
    }
  } catch (error: any) {
    log.commands.error({ error: error.message }, `[AUTOCONFIG] Error getting info for ${systemKey}`);
  }
  return '';
}

async function handleButtonInteraction(
  buttonInteraction: ButtonInteraction,
  mainAccount: any,
  premiumAccess: PremiumAccess,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  // Bulk sync has its own flow
  if (buttonInteraction.customId === 'bulksync_all') {
    await handleBulkSync(buttonInteraction, mainAccount, premiumAccess, originalInteraction);
    return;
  }

  const [action, system] = buttonInteraction.customId.split('_');

  // Modal/ephemeral activations must own their first interaction response; no loading panel for these
  const isModalFlow = action === 'activate' &&
    (system === 'autosac' || system === 'status' || system === 'autoexpediciones' || system === 'autorecycle' || system === 'autobuystw');

  if (!isModalFlow) {
    // Acknowledge the button click immediately (within Discord's 3-second window)
    await buttonInteraction.deferUpdate();
    // Show loading state on the clicked system's button right away
    try {
      const currentStatus = await checkAllSystemsStatus(originalInteraction.user.id, mainAccount.accountId);
      const loadingPanel = await buildPanel(
        originalInteraction, mainAccount, premiumAccess, currentStatus, false, system as SystemKey
      );
      await replyPanel(originalInteraction, loadingPanel);
    } catch {
      // Loading state is best-effort; the final update will still follow
    }
  }

  if (action === 'activate') {
    await handleSystemActivation(buttonInteraction, system as SystemKey, mainAccount, premiumAccess, originalInteraction);
  } else {
    await handleSystemDeactivation(buttonInteraction, system as SystemKey, mainAccount);
  }

  // AutoExpediciones/AutoRecycle activation manage their own updateMainPanel internally
  // (need to wait for user selection before updating)
  const handlesOwnUpdate = action === 'activate' &&
    (system === 'autoexpediciones' || system === 'autorecycle' || system === 'autobuystw');
  if (!handlesOwnUpdate) {
    await new Promise(resolve => setTimeout(resolve, 500));
    await updateMainPanel(originalInteraction, mainAccount, premiumAccess, system as SystemKey, action === 'activate');
  }
}

// ==================== HANDLERS DE ACTIVACIÓN ====================

async function handleSystemActivation(
  interaction: ButtonInteraction,
  system: SystemKey,
  mainAccount: any,
  premiumAccess: PremiumAccess,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;
  
  // Verificar premium si es requerido
  if (!canUseSystem(system, premiumAccess)) {
    const errMsg = `${getEmoji(interaction.client, 'error')} ${translate('autoconfig.errors.premiumRequired', lang)}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: errMsg, ephemeral: true });
    } else {
      await interaction.reply({ content: errMsg, ephemeral: true });
    }
    return;
  }

  switch (system) {
    case 'autokick':
      await handleAutoKickActivation(interaction, mainAccount);
      break;
    case 'autosac':
      await handleAutoSACActivation(interaction, mainAccount);
      break;
    case 'autodaily':
      await handleAutoDailyActivation(interaction, mainAccount);
      break;
    case 'status':
      await handleStatusActivation(interaction, mainAccount);
      break;
    case 'autoexpediciones':
      await handleAutoExpedicionesActivation(interaction, mainAccount, originalInteraction, premiumAccess);
      break;
    case 'autosecurity':
      await handleAutoSecurityActivation(interaction, mainAccount);
      break;
    case 'autobuyfreeitems':
      await handleAutoBuyFreeItemsActivation(interaction, mainAccount);
      break;
    case 'autobuyselected':
      await handleAutoBuySelectedActivation(interaction, mainAccount);
      break;
    case 'reminder':
      await handleReminderActivation(interaction, mainAccount);
      break;
    case 'autoreroll':
      await handleAutoRerollActivation(interaction, mainAccount);
      break;
    case 'autoacceptfriends':
      await handleAutoAcceptFriendsActivation(interaction, mainAccount);
      break;
    case 'autorecycle':
      await handleAutoRecycleActivation(interaction, mainAccount, originalInteraction, premiumAccess);
      break;
    case 'autobuystw':
      await handleAutoBuySTWActivation(interaction, mainAccount, originalInteraction, premiumAccess);
      break;
    case 'autopurgefriends':
      await handleAutoPurgeFriendsActivation(interaction, mainAccount);
      break;
    case 'autoloadout':
      await handleAutoLoadoutActivation(interaction, mainAccount);
      break;
    case 'autosurvivors':
      await handleAutoSurvivorsActivation(interaction, mainAccount);
      break;
    case 'autofreellamas':
      await handleAutoFreeLlamasActivation(interaction, mainAccount);
      break;
    case 'autofriendalerts':
      await handleAutoFriendAlertsActivation(interaction, mainAccount);
      break;
    default: {
      const errMsg = `${getEmoji(interaction.client, 'error')} ${translate('autoconfig.errors.notImplemented', lang)}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errMsg, ephemeral: true });
      } else {
        await interaction.reply({ content: errMsg, ephemeral: true });
      }
    }
  }
}

async function handleAutoKickActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    // Buscar o crear entrada
    let autoKick = await AutoKick.findOne({ discordId });
    
    if (!autoKick) {
      autoKick = new AutoKick({
        discordId,
        accounts: new Map(),
      });
    }

    // Configurar cuenta
    autoKick.accounts.set(accountId, {
      displayName: mainAccount.displayName,
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      kickPartyMembers: true,
      transferMaterials: true,
      collectRewards: true,
      embedRewards: true,
      autoLeave: true,
      kickMode: 'always',
      autoReinvite: true,
    });

    autoKick.markModified('accounts');
    await autoKick.save();
    
    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoKick activado');

    // Reconectar XMPP de AutoKick
    try {
      await callCore('automation.autoKick.reconnect', discordId, accountId);
      log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoKick XMPP reconectado');
    } catch (xmppError: any) {
      log.commands.warn({ error: xmppError.message }, '[AUTOCONFIG] Error reconectando AutoKick XMPP');
    }
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activando AutoKick');
  }
}

async function handleAutoSACActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;
  const modal = new ModalBuilder()
    .setCustomId('autosac_activate_modal')
    .setTitle(`🪙 ${translate('autoconfig.sac.modalTitle', lang)}`);

  const codeInput = new TextInputBuilder()
    .setCustomId('sac_code')
    .setLabel(translate('autoconfig.sac.modalLabel', lang))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(translate('autoconfig.sac.modalPlaceholder', lang))
    .setRequired(true)
    .setMaxLength(50);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === 'autosac_activate_modal' && i.user.id === interaction.user.id,
      time: 60000,
    });

    const sacCode = modalSubmit.fields.getTextInputValue('sac_code');
    
    await modalSubmit.deferUpdate();

    let autoSAC = await AutoSAC.findOne({ discordId: interaction.user.id });
    
    if (!autoSAC) {
      autoSAC = new AutoSAC({
        discordId: interaction.user.id,
        accounts: new Map(),
      });
    }

    autoSAC.accounts.set(mainAccount.accountId, {
      isActive: true,
      sacToSet: sacCode,
      accountId: mainAccount.accountId,
    });

    await autoSAC.save();
    await applyAutoSACSilently(interaction.user.id, mainAccount.accountId, sacCode);
    
    log.commands.info({ 
      discordId: interaction.user.id, 
      accountId: mainAccount.accountId, 
      sacCode 
    }, '[AUTOCONFIG] AutoSAC activado');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error en modal AutoSAC');
  }
}

async function handleAutoDailyActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    let autoDaily = await AutoDaily.findOne({ discordId: interaction.user.id });
    
    if (!autoDaily) {
      autoDaily = new AutoDaily({
        discordId: interaction.user.id,
        accounts: new Map(),
      });
    }

    autoDaily.accounts.set(mainAccount.accountId, {
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      accountId: mainAccount.accountId,
    });

    await autoDaily.save();
    
    log.commands.info({ 
      discordId: interaction.user.id, 
      accountId: mainAccount.accountId 
    }, '[AUTOCONFIG] AutoDaily activado');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activando AutoDaily');
  }
}

async function handleStatusActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;
  const modal = new ModalBuilder()
    .setCustomId('status_activate_modal')
    .setTitle(`[MOBILE] ${translate('autoconfig.statusFn.modalTitle', lang)}`);

  const messageInput = new TextInputBuilder()
    .setCustomId('status_message')
    .setLabel(translate('autoconfig.statusFn.modalLabel', lang))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(translate('autoconfig.statusFn.modalPlaceholder', lang))
    .setRequired(true)
    .setMaxLength(100);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === 'status_activate_modal' && i.user.id === interaction.user.id,
      time: 60000,
    });

    const statusMessage = modalSubmit.fields.getTextInputValue('status_message');
    
    await modalSubmit.deferUpdate();

    let statusFn = await StatusFortnite.findOne({ discordId: interaction.user.id, accountId: mainAccount.accountId });
    
    if (!statusFn) {
      statusFn = new StatusFortnite({
        discordId: interaction.user.id,
        accountId: mainAccount.accountId,
        mensaje: statusMessage,
        plataforma: 'AND',
        presenceMode: 'online',
        activo: true,
      });
    } else {
      statusFn.mensaje = statusMessage;
      statusFn.activo = true;
      statusFn.lastUpdate = new Date();
    }

    await statusFn.save();
    
    log.commands.info({ 
      discordId: interaction.user.id, 
      accountId: mainAccount.accountId,
      statusMessage 
    }, '[AUTOCONFIG] Status activado');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error en modal Status');
  }
}

async function handleAutoExpedicionesActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
  originalInteraction: ChatInputCommandInteraction,
  premiumAccess: PremiumAccess
): Promise<void> {
  // Responder de forma ephemeral para mostrar el selector de tipos
  await interaction.deferReply({ ephemeral: true });
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;

  try {
    const expTypes = ['heroes', 'survivors', 'supplies', 'resources', 'traps', 'weapons'] as const;
    const rewardTypeOptions = expTypes.map(t =>
      new StringSelectMenuOptionBuilder()
        .setLabel(translate(`autoconfig.expediciones.types.${t}`, lang))
        .setDescription(translate(`autoconfig.expediciones.types.${t}_desc`, lang))
        .setValue(t.charAt(0).toUpperCase() + t.slice(1) as string)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('autoexp_reward_types')
      .setPlaceholder(translate('autoconfig.expediciones.footer', lang))
      .setMinValues(1)
      .setMaxValues(rewardTypeOptions.length)
      .addOptions(rewardTypeOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle(`🗺️ ${translate('autoconfig.expediciones.title', lang)}`)
      .setDescription(translate('autoconfig.expediciones.description', lang, { displayName: mainAccount.displayName }))
      .setFooter({ text: translate('autoconfig.expediciones.footer', lang) });

    const response = await interaction.editReply({ embeds: [embed], components: [row] });

    // Esperar selección del usuario (60 segundos)
    let selectInteraction: StringSelectMenuInteraction;
    try {
      selectInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id && i.customId === 'autoexp_reward_types',
        time: 60000,
      }) as StringSelectMenuInteraction;
    } catch {
      // Timeout
      const disabled = new StringSelectMenuBuilder()
        .setCustomId('autoexp_reward_types')
        .setPlaceholder(translate('autoconfig.expediciones.timeoutPlaceholder', lang))
        .setDisabled(true)
        .addOptions(new StringSelectMenuOptionBuilder().setLabel('-').setValue('-'));
      await interaction.editReply({
        embeds: [embed.setDescription(translate('autoconfig.expediciones.timeout', lang))],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabled)],
      });
      return;
    }

    await selectInteraction.deferUpdate();
    const selectedTypes = selectInteraction.values;

    // Guardar en base de datos
    let autoExp = await AutoExpediciones.findOne({ discordId: interaction.user.id });
    if (!autoExp) {
      autoExp = new AutoExpediciones({
        discordId: interaction.user.id,
        accounts: new Map(),
      });
    }

    autoExp.accounts.set(mainAccount.accountId, {
      isActive: true,
      rewardTypes: selectedTypes,
      createdAt: new Date(),
      lastActivity: new Date(),
      displayName: mainAccount.displayName,
    });

    autoExp.markModified('accounts');
    await autoExp.save();

    log.commands.info({
      discordId: interaction.user.id,
      accountId: mainAccount.accountId,
      rewardTypes: selectedTypes,
    }, '[AUTOCONFIG] AutoExpediciones activado');

    // Confirmar al usuario
    const typesFormatted = selectedTypes.join(', ');
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setTitle(`🗺️ ${translate('autoconfig.expediciones.activated.title', lang)}`)
          .setDescription(translate('autoconfig.expediciones.activated.description', lang, { displayName: mainAccount.displayName, types: typesFormatted }))
          .setFooter({ text: translate('autoconfig.expediciones.activated.footer', lang) }),
      ],
      components: [],
    });

    // Actualizar el panel principal
    await new Promise(resolve => setTimeout(resolve, 500));
    await updateMainPanel(originalInteraction, mainAccount, premiumAccess, 'autoexpediciones', true);

  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activando AutoExpediciones');
    await interaction.editReply({
      content: translate('autoconfig.expediciones.error', lang),
      components: [],
    });
  }
}

// ==================== HANDLERS DE DESACTIVACIÓN ====================

async function handleSystemDeactivation(
  interaction: ButtonInteraction,
  system: SystemKey,
  mainAccount: any
): Promise<void> {
  switch (system) {
    case 'autokick':
      await handleAutoKickDeactivation(interaction, mainAccount);
      break;
    case 'autosac':
      await handleAutoSACDeactivation(interaction, mainAccount);
      break;
    case 'autodaily':
      await handleAutoDailyDeactivation(interaction, mainAccount);
      break;
    case 'status':
      await handleStatusDeactivation(interaction, mainAccount);
      break;
    case 'autoexpediciones':
      await handleAutoExpedicionesDeactivation(interaction, mainAccount);
      break;
    case 'autosecurity':
      await handleAutoSecurityDeactivation(interaction, mainAccount);
      break;
    case 'autobuyfreeitems':
      await handleAutoBuyFreeItemsDeactivation(interaction, mainAccount);
      break;
    case 'autobuyselected':
      await handleAutoBuySelectedDeactivation(interaction, mainAccount);
      break;
    case 'reminder':
      await handleReminderDeactivation(interaction, mainAccount);
      break;
    case 'autoreroll':
      await handleAutoRerollDeactivation(interaction, mainAccount);
      break;
    case 'autoacceptfriends':
      await handleAutoAcceptFriendsDeactivation(interaction, mainAccount);
      break;
    case 'autorecycle':
      await handleAutoRecycleDeactivation(interaction, mainAccount);
      break;
    case 'autobuystw':
      await handleAutoBuySTWDeactivation(interaction, mainAccount);
      break;
    case 'autopurgefriends':
      await handleAutoPurgeFriendsDeactivation(interaction, mainAccount);
      break;
    case 'autoloadout':
      await handleAutoLoadoutDeactivation(interaction, mainAccount);
      break;
    case 'autosurvivors':
      await handleAutoSurvivorsDeactivation(interaction, mainAccount);
      break;
    case 'autofreellamas':
      await handleAutoFreeLlamasDeactivation(interaction, mainAccount);
      break;
    case 'autofriendalerts':
      await handleAutoFriendAlertsDeactivation(interaction, mainAccount);
      break;
    default: {
      const deactLang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;
      await interaction.followUp({
        content: `${getEmoji(interaction.client, 'error')} ${translate('autoconfig.errors.notImplemented', deactLang)}`,
        ephemeral: true,
      });
    }
  }
}

async function handleAutoKickDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const autoKick = await AutoKick.findOne({ discordId: interaction.user.id });
    
    if (autoKick && autoKick.accounts.has(mainAccount.accountId)) {
      // Desactivar en la DB
      const accountData = autoKick.accounts.get(mainAccount.accountId)!;
      autoKick.accounts.set(mainAccount.accountId, {
        ...plainAccountEntry(accountData),
        isActive: false,
        lastActivity: new Date(),
      });
      autoKick.markModified('accounts');
      await autoKick.save();

      log.commands.info({ 
        discordId: interaction.user.id, 
        accountId: mainAccount.accountId 
      }, '[AUTOCONFIG] AutoKick desactivado');

      // Desconectar XMPP de AutoKick
      try {
        await callCore('automation.autoKick.disconnect', interaction.user.id, mainAccount.accountId);
        log.commands.info({ 
          discordId: interaction.user.id, 
          accountId: mainAccount.accountId 
        }, '[AUTOCONFIG] AutoKick XMPP desconectado');
      } catch (xmppError: any) {
        log.commands.warn({ error: xmppError.message }, '[AUTOCONFIG] Error desconectando AutoKick XMPP');
      }
    }
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error desactivando AutoKick');
  }
}

async function handleAutoSACDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const autoSAC = await AutoSAC.findOne({ discordId: interaction.user.id });
    if (autoSAC) {
      autoSAC.accounts.delete(mainAccount.accountId);
      await autoSAC.save();
    }
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error desactivando AutoSAC');
  }
}

async function handleAutoDailyDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const autoDaily = await AutoDaily.findOne({ discordId: interaction.user.id });
    if (autoDaily) {
      autoDaily.accounts.delete(mainAccount.accountId);
      await autoDaily.save();
    }
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error desactivando AutoDaily');
  }
}

async function handleStatusDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    await StatusFortnite.deleteOne({ discordId: interaction.user.id, accountId: mainAccount.accountId });
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error desactivando Status');
  }
}

async function handleAutoExpedicionesDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const autoExp = await AutoExpediciones.findOne({ discordId: interaction.user.id });
    if (autoExp) {
      autoExp.accounts.delete(mainAccount.accountId);
      await autoExp.save();
    }
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error desactivando AutoExpediciones');
  }
}

async function handleAutoSecurityActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    // Refresh token to get a valid access token for fetching current device auths
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (!userInfo) {
      log.commands.warn({ discordId }, '[AUTOCONFIG] AutoSecurity: user info not found');
      return;
    }

    const { account } = await refreshAccountToken(userInfo, accountId);

    let knownDeviceIds: string[] = [];
    let snapshotBaseline: IAccountSecuritySnapshot | undefined;
    if (account) {
      try {
        snapshotBaseline = await callCore<IAccountSecuritySnapshot>('automation.autoSecurity.captureBaseline', account.accountId, account.accessToken);
        knownDeviceIds = snapshotBaseline.knownDeviceIds;
        log.commands.info(
          { discordId, accountId, count: knownDeviceIds.length },
          '[AUTOCONFIG] AutoSecurity: captured full security baseline'
        );
      } catch (fetchErr: any) {
        log.commands.warn({ error: fetchErr.message }, '[AUTOCONFIG] AutoSecurity: could not fetch baseline, starting empty');
      }
    }

    let autoSec = await AutoSecuritySystem.findOne({ discordId });
    if (!autoSec) {
      autoSec = new AutoSecuritySystem({ discordId, accounts: new Map() });
    }

    autoSec.accounts.set(accountId, {
      isActive: true,
      accountId,
      knownDeviceIds,
      snapshot: snapshotBaseline,
      lastChecked: new Date(),
      createdAt: new Date(),
      lastActivity: new Date(),
      suspended: false,
      suspendedReason: '',
    });

    autoSec.markModified('accounts');
    await autoSec.save();

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoSecurity activated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoSecurity');
  }
}

async function handleAutoSecurityDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const autoSec = await AutoSecuritySystem.findOne({ discordId: interaction.user.id });
    if (autoSec) {
      autoSec.accounts.delete(mainAccount.accountId);
      autoSec.markModified('accounts');
      await autoSec.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoSecurity deactivated'
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoSecurity');
  }
}

async function handleAutoBuyFreeItemsActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    let autoBuy = await AutoBuyFreeItems.findOne({ discordId });
    if (!autoBuy) {
      autoBuy = new AutoBuyFreeItems({ discordId, accounts: new Map() });
    }

    autoBuy.accounts.set(accountId, {
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      accountId,
    });

    autoBuy.markModified('accounts');
    await autoBuy.save();

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoBuyFreeItems activated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoBuyFreeItems');
  }
}

async function handleAutoBuyFreeItemsDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const autoBuy = await AutoBuyFreeItems.findOne({ discordId: interaction.user.id });
    if (autoBuy) {
      autoBuy.accounts.delete(mainAccount.accountId);
      autoBuy.markModified('accounts');
      await autoBuy.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoBuyFreeItems deactivated'
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoBuyFreeItems');
  }
}

async function handleAutoBuySelectedActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;
    const lang: SupportedLanguage = await getUserLanguage(discordId) as SupportedLanguage;

    let doc = await AutoBuySelectedItems.findOne({ discordId });
    if (!doc) {
      doc = new AutoBuySelectedItems({ discordId, accounts: new Map() });
    }

    const existing = doc.accounts.get(accountId);
    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      watchedCosmeticIds: existing?.watchedCosmeticIds ?? [],
      createdAt: existing?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoBuySelected activated');

    // Ephemeral hint
    await interaction.followUp({
      content: `${getEmoji(interaction.client, 'success')} ${translate('autoconfig.hints.autobuySelected', lang)}`,
      ephemeral: true,
    }).catch(() => {});
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoBuySelected');
  }
}

async function handleAutoBuySelectedDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const doc = await AutoBuySelectedItems.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      doc.markModified('accounts');
      await doc.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoBuySelected deactivated'
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoBuySelected');
  }
}

async function handleReminderActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;
    const lang: SupportedLanguage = await getUserLanguage(discordId) as SupportedLanguage;

    let doc = await Reminder.findOne({ discordId });
    if (!doc) {
      doc = new Reminder({ discordId, accounts: new Map() });
    }

    const existing = doc.accounts.get(accountId);
    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      watchedItems: existing?.watchedItems ?? [],
      createdAt: existing?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] Reminder activated');

    // Ephemeral hint
    await interaction.followUp({
      content: `${getEmoji(interaction.client, 'success')} ${translate('autoconfig.hints.reminder', lang)}`,
      ephemeral: true,
    }).catch(() => {});
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating Reminder');
  }
}

async function handleReminderDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const doc = await Reminder.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      doc.markModified('accounts');
      await doc.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] Reminder deactivated'
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating Reminder');
  }
}

async function handleAutoRerollActivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;
    const lang: SupportedLanguage = await getUserLanguage(discordId) as SupportedLanguage;

    let doc = await AutoReroll.findOne({ discordId });
    if (!doc) {
      doc = new AutoReroll({ discordId, accounts: new Map() });
    }

    const existing = doc.accounts.get(accountId);
    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      unwantedQuests: existing?.unwantedQuests ?? [],
      createdAt: existing?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoReroll activated');

    await interaction.followUp({
      content: `${getEmoji(interaction.client, 'success')} ${translate('autoconfig.hints.autoreroll', lang)}`,
      ephemeral: true,
    }).catch(() => {});
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoReroll');
  }
}

async function handleAutoRerollDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const doc = await AutoReroll.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      doc.markModified('accounts');
      await doc.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoReroll deactivated',
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoReroll');
  }
}

async function handleAutoAcceptFriendsActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    let doc = await AutoAcceptFriends.findOne({ discordId });
    if (!doc) {
      doc = new AutoAcceptFriends({ discordId, accounts: new Map() });
    }

    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      createdAt: doc.accounts.get(accountId)?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    // Connect XMPP and accept all pending
    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (userInfo) {
      await callCore('automation.autoAcceptFriends.activate', discordId, accountId);
    }

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoAcceptFriends activated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoAcceptFriends');
  }
}

async function handleAutoAcceptFriendsDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    const doc = await AutoAcceptFriends.findOne({ discordId });
    if (doc) {
      doc.accounts.delete(accountId);
      doc.markModified('accounts');
      await doc.save();
    }

    await callCore('automation.autoAcceptFriends.deactivate', discordId, accountId);

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoAcceptFriends deactivated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoAcceptFriends');
  }
}

async function handleAutoRecycleActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
  originalInteraction: ChatInputCommandInteraction,
  premiumAccess: PremiumAccess
): Promise<void> {
  // AutoRecycle uses an ephemeral UI to configure each category independently
  await interaction.deferReply({ ephemeral: true });
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;

  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    const CAT_KEYS = ['schematics', 'heroes', 'survivors', 'defenders'] as const;
    const CATEGORIES = CAT_KEYS.map(k => ({
      value: k,
      label: translate(`autorecycle.cmd.categories.${k}`, lang),
      desc: translate(`autorecycle.cmd.categories.${k}_desc`, lang),
    }));

    // Step 1: Category selection
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('autorecycle_categories')
      .setPlaceholder(translate('autoconfig.recycleWizard.selectPlaceholder', lang))
      .setMinValues(1)
      .setMaxValues(CATEGORIES.length)
      .addOptions(CATEGORIES.map(c =>
        new StringSelectMenuOptionBuilder().setLabel(c.label).setDescription(c.desc).setValue(c.value)
      ));

    const catRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);
    const catEmbed = new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle(translate('autoconfig.recycleWizard.title', lang))
      .setDescription(translate('autoconfig.recycleWizard.description', lang, { displayName: mainAccount.displayName }))
      .setFooter({ text: translate('autoconfig.recycleWizard.footer', lang) });

    const catMsg = await interaction.editReply({ embeds: [catEmbed], components: [catRow] });

    let catInteraction: StringSelectMenuInteraction;
    try {
      catInteraction = await catMsg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === discordId && i.customId === 'autorecycle_categories',
        time: 60000,
      }) as StringSelectMenuInteraction;
    } catch {
      await interaction.editReply({ embeds: [catEmbed.setDescription(translate('autoconfig.recycleWizard.timeout', lang))], components: [] });
      return;
    }

    await catInteraction.deferUpdate();
    const selectedCategories = catInteraction.values;

    // Steps 2+: For each selected category, ask rarity & mode
    const configs: Record<string, IRecycleCategoryConfig> = {};
    const disabledConfig: IRecycleCategoryConfig = { enabled: false, rarities: [], duplicatesOnly: false };

    for (let idx = 0; idx < selectedCategories.length; idx++) {
      const catKey = selectedCategories[idx];
      const catLabel = CATEGORIES.find(c => c.value === catKey)!.label;
      const step = idx + 1;
      const total = selectedCategories.length;

      // ── Rarity select for this category ──
      const raritySelect = new StringSelectMenuBuilder()
        .setCustomId(`autorecycle_rar_${catKey}`)
        .setPlaceholder(translate('autoconfig.recycleWizard.rarityPlaceholder', lang, { label: catLabel }))
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel(translate('autoconfig.recycleWizard.c', lang)).setValue('c'),
          new StringSelectMenuOptionBuilder().setLabel(translate('autoconfig.recycleWizard.uc', lang)).setValue('uc'),
          new StringSelectMenuOptionBuilder().setLabel(translate('autoconfig.recycleWizard.r', lang)).setValue('r'),
          new StringSelectMenuOptionBuilder().setLabel(translate('autoconfig.recycleWizard.vr', lang)).setValue('vr'),
          new StringSelectMenuOptionBuilder().setLabel(translate('autoconfig.recycleWizard.sr', lang)).setValue('sr'),
        );

      const rarRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(raritySelect);
      const rarEmbed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle(translate('autoconfig.recycleWizard.rarityTitle', lang, { label: catLabel, step: String(step), total: String(total) }))
        .setDescription(translate('autoconfig.recycleWizard.rarityDescription', lang, { label: catLabel }));

      await interaction.editReply({ embeds: [rarEmbed], components: [rarRow] });

      let rarInteraction: StringSelectMenuInteraction;
      try {
        rarInteraction = await catMsg.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === discordId && i.customId === `autorecycle_rar_${catKey}`,
          time: 60000,
        }) as StringSelectMenuInteraction;
      } catch {
        await interaction.editReply({ embeds: [rarEmbed.setDescription(translate('autoconfig.recycleWizard.timeout', lang))], components: [] });
        return;
      }

      await rarInteraction.deferUpdate();
      const selectedRarities = rarInteraction.values as ('c' | 'uc' | 'r' | 'vr' | 'sr')[];

      // ── Mode select for this category ──
      const dupeSelect = new StringSelectMenuBuilder()
        .setCustomId(`autorecycle_mode_${catKey}`)
        .setPlaceholder(translate('autoconfig.recycleWizard.modePlaceholder', lang, { label: catLabel }))
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(translate('autoconfig.recycleWizard.modeAll', lang))
            .setDescription(translate('autoconfig.recycleWizard.modeAllDesc', lang))
            .setValue('all'),
          new StringSelectMenuOptionBuilder()
            .setLabel(translate('autoconfig.recycleWizard.modeDupes', lang))
            .setDescription(translate('autoconfig.recycleWizard.modeDupesDesc', lang))
            .setValue('dupes'),
        );

      const dupeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(dupeSelect);
      const dupeEmbed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle(translate('autoconfig.recycleWizard.modeTitle', lang, { label: catLabel, step: String(step), total: String(total) }))
        .setDescription(translate('autoconfig.recycleWizard.modeDescription', lang, { label: catLabel, rarities: selectedRarities.join(', ') }));

      await interaction.editReply({ embeds: [dupeEmbed], components: [dupeRow] });

      let dupeInteraction: StringSelectMenuInteraction;
      try {
        dupeInteraction = await catMsg.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === discordId && i.customId === `autorecycle_mode_${catKey}`,
          time: 60000,
        }) as StringSelectMenuInteraction;
      } catch {
        await interaction.editReply({ embeds: [dupeEmbed.setDescription(translate('autoconfig.recycleWizard.timeout', lang))], components: [] });
        return;
      }

      await dupeInteraction.deferUpdate();

      configs[catKey] = {
        enabled: true,
        rarities: selectedRarities,
        duplicatesOnly: dupeInteraction.values[0] === 'dupes',
      };
    }

    // ── Save to DB ──
    let doc = await AutoRecycle.findOne({ discordId });
    if (!doc) {
      doc = new AutoRecycle({ discordId, accounts: new Map() });
    }

    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      schematics: configs['schematics'] ?? disabledConfig,
      heroes: configs['heroes'] ?? disabledConfig,
      survivors: configs['survivors'] ?? disabledConfig,
      defenders: configs['defenders'] ?? disabledConfig,
      createdAt: doc.accounts.get(accountId)?.createdAt ?? new Date(),
      lastActivity: new Date(),
      lastRecycledCount: 0,
    });

    doc.markModified('accounts');
    await doc.save();

    log.commands.info(
      { discordId, accountId, categories: selectedCategories },
      '[AUTOCONFIG] AutoRecycle activated',
    );

    // Confirm: build summary lines per category
    const summaryLines: string[] = [];
    for (const catKey of selectedCategories) {
      const cfg = configs[catKey];
      const catLabel = CATEGORIES.find(c => c.value === catKey)!.label;
      const mode = cfg.duplicatesOnly
        ? translate('autoconfig.recycleWizard.modeSummaryDupes', lang)
        : translate('autoconfig.recycleWizard.modeSummaryAll', lang);
      summaryLines.push(`**${catLabel}:** ${cfg.rarities.join(', ')} — ${mode}`);
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setTitle(translate('autoconfig.recycleWizard.activatedTitle', lang))
          .setDescription(translate('autoconfig.recycleWizard.activatedDescription', lang, { displayName: mainAccount.displayName, summary: summaryLines.join('\n') }))
          .setFooter({ text: translate('autoconfig.recycleWizard.activatedFooter', lang) }),
      ],
      components: [],
    });

    // Update the main panel
    await new Promise(resolve => setTimeout(resolve, 500));
    await updateMainPanel(originalInteraction, mainAccount, premiumAccess, 'autorecycle', true);
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoRecycle');
    await interaction.editReply({
      content: translate('autoconfig.recycleWizard.error', lang),
      components: [],
    }).catch(() => {});
  }
}

async function handleAutoRecycleDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any
): Promise<void> {
  try {
    const doc = await AutoRecycle.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      doc.markModified('accounts');
      await doc.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoRecycle deactivated',
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoRecycle');
  }
}

async function handleAutoBuySTWActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
  originalInteraction: ChatInputCommandInteraction,
  premiumAccess: PremiumAccess,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;

  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;
    const client = interaction.client;

    // Build select menu options with emojis
    const options = ALL_BUYABLE_KEYS.map(key => {
      const label = getBuyableItemLabel(key, lang);
      const emojiName = ITEM_EMOJI_MAP[key];
      let emojiId: string | undefined;
      if (emojiName) {
        const cache = (client.application as any)?.emojis?.cache;
        if (cache) {
          for (const emoji of cache.values()) {
            if (emoji.name === emojiName) {
              emojiId = emoji.id;
              break;
            }
          }
        }
      }

      const opt = new StringSelectMenuOptionBuilder()
        .setLabel(label.length > 100 ? label.slice(0, 100) : label)
        .setValue(key);

      if (emojiId) opt.setEmoji({ id: emojiId });
      return opt;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('autobuystw_cfg_items')
      .setPlaceholder(translate('autoconfig.stwWizard.selectPlaceholder', lang))
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options);

    const cfgEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(translate('autoconfig.stwWizard.title', lang))
      .setDescription(translate('autoconfig.stwWizard.description', lang, { displayName: mainAccount.displayName }))
      .setFooter({ text: translate('autoconfig.stwWizard.footer', lang) });

    const cfgMsg = await interaction.editReply({
      embeds: [cfgEmbed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
    });

    let itemInteraction: StringSelectMenuInteraction;
    try {
      itemInteraction = await cfgMsg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === discordId && i.customId === 'autobuystw_cfg_items',
        time: 120_000,
      }) as StringSelectMenuInteraction;
    } catch {
      await interaction.editReply({
        embeds: [cfgEmbed.setDescription(translate('autoconfig.stwWizard.timeout', lang))],
        components: [],
      });
      return;
    }

    await itemInteraction.deferUpdate();
    const selectedItems = itemInteraction.values;

    // Save to DB
    let doc = await AutoBuySTW.findOne({ discordId });
    if (!doc) {
      doc = new AutoBuySTW({ discordId, accounts: new Map() });
    }

    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      selectedItems,
      createdAt: doc.accounts.get(accountId)?.createdAt ?? new Date(),
      lastActivity: new Date(),
      lastPurchaseCount: 0,
      lastGoldSpent: 0,
    });

    doc.markModified('accounts');
    await doc.save();

    log.commands.info(
      { discordId, accountId, items: selectedItems },
      '[AUTOCONFIG] AutoBuySTW activated',
    );

    // Build summary
    const summaryLines: string[] = [];
    for (const key of selectedItems) {
      const label = getBuyableItemLabel(key, lang);
      const emojiName = ITEM_EMOJI_MAP[key];
      const emoji = emojiName ? getAppEmojiByName(client, emojiName) : '';
      summaryLines.push(`${emoji} ${label}`);
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setTitle(translate('autoconfig.stwWizard.activatedTitle', lang))
          .setDescription(translate('autoconfig.stwWizard.activatedDescription', lang, { displayName: mainAccount.displayName, items: summaryLines.join('\n') })),
      ],
      components: [],
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    await updateMainPanel(originalInteraction, mainAccount, premiumAccess, 'autobuystw', true);
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoBuySTW');
    await interaction.editReply({
      content: translate('autoconfig.stwWizard.error', lang),
      components: [],
    }).catch(() => {});
  }
}

async function handleAutoBuySTWDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const doc = await AutoBuySTW.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      doc.markModified('accounts');
      await doc.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoBuySTW deactivated',
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoBuySTW');
  }
}

async function handleAutoPurgeFriendsActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    let doc = await AutoPurgeFriends.findOne({ discordId });
    if (!doc) {
      doc = new AutoPurgeFriends({ discordId, accounts: new Map() });
    }

    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      whitelist: doc.accounts.get(accountId)?.whitelist ?? [],
      createdAt: doc.accounts.get(accountId)?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoPurgeFriends activated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoPurgeFriends');
  }
}

async function handleAutoPurgeFriendsDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const doc = await AutoPurgeFriends.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      doc.markModified('accounts');
      await doc.save();
    }
    log.commands.info(
      { discordId: interaction.user.id, accountId: mainAccount.accountId },
      '[AUTOCONFIG] AutoPurgeFriends deactivated',
    );
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoPurgeFriends');
  }
}

async function handleAutoLoadoutActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;
    const lang: SupportedLanguage = await getUserLanguage(discordId) as SupportedLanguage;

    let doc = await AutoLoadout.findOne({ discordId });
    if (!doc) {
      doc = new AutoLoadout({ discordId, accounts: new Map() });
    }

    const existing = doc.accounts.get(accountId);
    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      loadouts: existing?.loadouts ?? new Map(),
      createdAt: existing?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (userInfo) {
      await callCore('automation.autoLoadout.activate', discordId, accountId);
    }

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoLoadout activated');

    await interaction.followUp({
      content: `${getEmoji(interaction.client, 'success')} ${translate('autoconfig.hints.autoloadout', lang)}`,
      ephemeral: true,
    }).catch(() => {});
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoLoadout');
  }
}

async function handleAutoLoadoutDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    const doc = await AutoLoadout.findOne({ discordId });
    if (doc) {
      doc.accounts.delete(accountId);
      doc.markModified('accounts');
      await doc.save();
    }

    await callCore('automation.autoLoadout.deactivate', discordId, accountId);

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoLoadout deactivated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoLoadout');
  }
}

async function handleAutoSurvivorsActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;
    const lang: SupportedLanguage = await getUserLanguage(discordId) as SupportedLanguage;

    let doc = await AutoSurvivors.findOne({ discordId });
    if (!doc) {
      doc = new AutoSurvivors({ discordId, accounts: new Map() });
    }

    const existing = doc.accounts.get(accountId);
    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      presets: existing?.presets ?? new Map(),
      missionMappings: existing?.missionMappings ?? new Map(),
      createdAt: existing?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    const userInfo = await UsuarioInfo.findOne({ id: discordId });
    if (userInfo) {
      await callCore('automation.autoSurvivors.activate', discordId, accountId);
    }

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoSurvivors activated');

    await interaction.followUp({
      content: `${getEmoji(interaction.client, 'success')} ${translate('autoconfig.hints.autosurvivors', lang)}`,
      ephemeral: true,
    }).catch(() => {});
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoSurvivors');
  }
}

async function handleAutoSurvivorsDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    const doc = await AutoSurvivors.findOne({ discordId });
    if (doc) {
      doc.accounts.delete(accountId);
      doc.markModified('accounts');
      await doc.save();
    }

    await callCore('automation.autoSurvivors.deactivate', discordId, accountId);

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoSurvivors deactivated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoSurvivors');
  }
}

async function handleAutoFreeLlamasActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    let doc = await AutoFreeLlamas.findOne({ discordId: interaction.user.id });

    if (!doc) {
      doc = new AutoFreeLlamas({
        discordId: interaction.user.id,
        accounts: new Map(),
      });
    }

    doc.accounts.set(mainAccount.accountId, {
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
      accountId: mainAccount.accountId,
    });

    await doc.save();

    log.commands.info({
      discordId: interaction.user.id,
      accountId: mainAccount.accountId,
    }, '[AUTOCONFIG] AutoFreeLlamas activado');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activando AutoFreeLlamas');
  }
}

async function handleAutoFreeLlamasDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const doc = await AutoFreeLlamas.findOne({ discordId: interaction.user.id });
    if (doc) {
      doc.accounts.delete(mainAccount.accountId);
      await doc.save();
    }

    log.commands.info({
      discordId: interaction.user.id,
      accountId: mainAccount.accountId,
    }, '[AUTOCONFIG] AutoFreeLlamas desactivado');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error desactivando AutoFreeLlamas');
  }
}

async function handleAutoFriendAlertsActivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    let doc = await AutoFriendAlerts.findOne({ discordId });
    if (!doc) {
      doc = new AutoFriendAlerts({ discordId, accounts: new Map() });
    }

    const existing = doc.accounts.get(accountId);
    doc.accounts.set(accountId, {
      isActive: true,
      accountId,
      // The tracked list starts empty; the user picks friends with /friendalerts add.
      friends: existing?.friends ?? [],
      createdAt: existing?.createdAt ?? new Date(),
      lastActivity: new Date(),
    });

    doc.markModified('accounts');
    await doc.save();

    // No-op (no XMPP connection) while the friend list is empty.
    await callCore('automation.autoFriendAlerts.sync', discordId, accountId);

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoFriendAlerts activated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error activating AutoFriendAlerts');
  }
}

async function handleAutoFriendAlertsDeactivation(
  interaction: ButtonInteraction,
  mainAccount: any,
): Promise<void> {
  try {
    const discordId = interaction.user.id;
    const accountId = mainAccount.accountId;

    const doc = await AutoFriendAlerts.findOne({ discordId });
    if (doc) {
      doc.accounts.delete(accountId);
      doc.markModified('accounts');
      await doc.save();
    }

    await callCore('automation.autoFriendAlerts.deactivate', discordId, accountId);

    log.commands.info({ discordId, accountId }, '[AUTOCONFIG] AutoFriendAlerts deactivated');
  } catch (error: any) {
    log.commands.error({ error: error.message }, '[AUTOCONFIG] Error deactivating AutoFriendAlerts');
  }
}

// ==================== BULK SYNCHRONIZE ====================

/**
 * Systems that can NOT be bulk-synced because their data is per-account
 * (device IDs, loadout GUIDs, survivor item IDs).
 */
const UNSYNCABLE_SYSTEMS: ReadonlySet<SystemKey> = new Set(['autosecurity', 'autoloadout', 'autosurvivors']);

/**
 * Handles the Bulk Synchronize button.
 * Copies active configurations from the main account to all secondary accounts.
 */
async function handleBulkSync(
  interaction: ButtonInteraction,
  mainAccount: any,
  premiumAccess: PremiumAccess,
  originalInteraction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const lang: SupportedLanguage = await getUserLanguage(interaction.user.id) as SupportedLanguage;
  const discordId = interaction.user.id;
  const mainAccountId = mainAccount.accountId;
  const emojiSuccess = getEmoji(interaction.client, 'success');
  const emojiError = getEmoji(interaction.client, 'error');

  // Get all accounts
  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths || userInfo.deviceAuths.length <= 1) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription(`${emojiError} ${translate('autoconfig.bulkSync.noSecondary', lang)}`)],
    });
    return;
  }

  const secondaryAccounts = userInfo.deviceAuths.filter((a: any) => !a.cuentaMain && a.accountId !== mainAccountId);
  if (secondaryAccounts.length === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription(`${emojiError} ${translate('autoconfig.bulkSync.noSecondary', lang)}`)],
    });
    return;
  }

  // Check which systems are active on main
  const mainStatus = await checkAllSystemsStatus(discordId, mainAccountId);
  const activeSyncable = (Object.entries(mainStatus) as [SystemKey, boolean][])
    .filter(([sys, active]) => active && !UNSYNCABLE_SYSTEMS.has(sys))
    .map(([sys]) => sys);

  if (activeSyncable.length === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription(`${emojiError} ${translate('autoconfig.bulkSync.noActive', lang)}`)],
    });
    return;
  }

  // Build confirmation embed
  const systemsList = activeSyncable
    .map(sys => `- **${systemName(sys, lang)}**`)
    .join('\n');

  const confirmEmbed = new EmbedBuilder()
    .setColor(EMBED_COLORS.info)
    .setTitle(translate('autoconfig.bulkSync.confirmTitle', lang))
    .setDescription(translate('autoconfig.bulkSync.confirmDescription', lang, {
      mainAccount: mainAccount.displayName,
      count: String(secondaryAccounts.length),
      systems: systemsList,
    }));

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('bulksync_confirm')
      .setLabel(translate('autoconfig.bulkSync.confirmButton', lang))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('bulksync_cancel')
      .setLabel(translate('autoconfig.bulkSync.cancelButton', lang))
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [confirmEmbed], components: [confirmRow] });

  // Wait for confirmation
  let confirmInteraction: ButtonInteraction;
  try {
    confirmInteraction = await interaction.channel!.awaitMessageComponent({
      filter: (i) => (i.customId === 'bulksync_confirm' || i.customId === 'bulksync_cancel') && i.user.id === discordId,
      componentType: ComponentType.Button,
      time: 30000,
    }) as ButtonInteraction;
  } catch {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`${emojiError} ${translate('autoconfig.bulkSync.timeout', lang)}`)],
      components: [],
    });
    return;
  }

  if (confirmInteraction.customId === 'bulksync_cancel') {
    await confirmInteraction.update({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`${emojiError} ${translate('autoconfig.bulkSync.cancelled', lang)}`)],
      components: [],
    });
    return;
  }

  // Confirmed — run synchronization
  await confirmInteraction.update({
    embeds: [new EmbedBuilder().setColor(EMBED_COLORS.info).setDescription(`${getEmoji(interaction.client, 'loading')} **${translate('autoconfig.status.processing', lang)}**`)],
    components: [],
  });

  try {
    const results = await executeBulkSync(discordId, mainAccountId, secondaryAccounts, activeSyncable);

    const successCount = results.filter(r => r.success).length;
    const accountLines = results.map(r => {
      const emoji = r.success ? emojiSuccess : emojiError;
      const statusText = r.success ? translate('autoconfig.bulkSync.accountSuccess', lang) : translate('autoconfig.bulkSync.accountError', lang);
      return `${emoji} **${r.displayName}** — ${statusText}`;
    }).join('\n');

    const syncedSystemsList = activeSyncable
      .map(sys => `**${systemName(sys, lang)}**`)
      .join(', ');

    const resultEmbed = new EmbedBuilder()
      .setColor(successCount === results.length ? 0x00FF00 : 0xFFFF00)
      .setTitle(`${emojiSuccess} ${translate('autoconfig.bulkSync.successTitle', lang)}`)
      .setDescription(
        translate('autoconfig.bulkSync.successDescription', lang, {
          successCount: String(successCount),
          totalCount: String(results.length),
          systems: syncedSystemsList,
        }) + `\n\n${accountLines}`
      );

    await interaction.editReply({ embeds: [resultEmbed], components: [] });
  } catch (error: any) {
    log.commands.error({ error: error.message, discordId }, '[AUTOCONFIG] Bulk sync error');
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`${emojiError} ${translate('autoconfig.bulkSync.errorTitle', lang)}`)
        .setDescription(translate('autoconfig.bulkSync.errorDescription', lang))],
      components: [],
    });
  }
}

/**
 * Executes the bulk sync for all secondary accounts.
 */
async function executeBulkSync(
  discordId: string,
  mainAccountId: string,
  secondaryAccounts: any[],
  systems: SystemKey[],
): Promise<{ accountId: string; displayName: string; success: boolean }[]> {
  const results: { accountId: string; displayName: string; success: boolean }[] = [];

  for (const account of secondaryAccounts) {
    try {
      for (const system of systems) {
        await syncSystem(discordId, mainAccountId, account.accountId, account.displayName, system);
      }
      results.push({ accountId: account.accountId, displayName: account.displayName, success: true });
    } catch (error: any) {
      log.commands.error(
        { error: error.message, discordId, accountId: account.accountId },
        '[AUTOCONFIG] Bulk sync failed for account',
      );
      results.push({ accountId: account.accountId, displayName: account.displayName, success: false });
    }
  }

  return results;
}

/**
 * Syncs a single system from the main account to a target account.
 */
async function syncSystem(
  discordId: string,
  mainAccountId: string,
  targetAccountId: string,
  targetDisplayName: string,
  system: SystemKey,
): Promise<void> {
  const now = new Date();

  switch (system) {
    case 'autokick': {
      const doc = await AutoKick.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        ...plainAccountEntry(main),
        displayName: targetDisplayName,
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autosac': {
      const doc = await AutoSAC.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        sacToSet: main.sacToSet,
        accountId: targetAccountId,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autodaily': {
      const doc = await AutoDaily.findOne({ discordId });
      if (!doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
        accountId: targetAccountId,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'status': {
      const mainStatus = await StatusFortnite.findOne({ discordId, accountId: mainAccountId });
      if (!mainStatus) return;
      await StatusFortnite.findOneAndUpdate(
        { discordId, accountId: targetAccountId },
        {
          mensaje: mainStatus.mensaje,
          plataforma: mainStatus.plataforma,
          presenceMode: mainStatus.presenceMode,
          activo: true,
          lastUpdate: now,
        },
        { upsert: true },
      );
      break;
    }

    case 'autoexpediciones': {
      const doc = await AutoExpediciones.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        rewardTypes: [...(main.rewardTypes || [])],
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
        displayName: targetDisplayName,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autobuyfreeitems': {
      const doc = await AutoBuyFreeItems.findOne({ discordId });
      if (!doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
        accountId: targetAccountId,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autobuyselected': {
      const doc = await AutoBuySelectedItems.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        watchedCosmeticIds: [...(main.watchedCosmeticIds || [])],
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'reminder': {
      const doc = await Reminder.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        watchedItems: (main.watchedItems || []).map((item: any) => ({ ...item })),
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autoreroll': {
      const doc = await AutoReroll.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        unwantedQuests: [...(main.unwantedQuests || [])],
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autoacceptfriends': {
      const doc = await AutoAcceptFriends.findOne({ discordId });
      if (!doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autorecycle': {
      const doc = await AutoRecycle.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      const copyCategory = (cat: any): IRecycleCategoryConfig => ({
        enabled: cat?.enabled ?? false,
        rarities: [...(cat?.rarities || [])],
        duplicatesOnly: cat?.duplicatesOnly ?? false,
      });
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        schematics: copyCategory(main.schematics),
        heroes: copyCategory(main.heroes),
        survivors: copyCategory(main.survivors),
        defenders: copyCategory(main.defenders),
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
        lastRecycledCount: 0,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autobuystw': {
      const doc = await AutoBuySTW.findOne({ discordId });
      const main = doc?.accounts?.get(mainAccountId);
      if (!main || !doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        selectedItems: [...(main.selectedItems || [])],
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
        lastPurchaseCount: 0,
        lastGoldSpent: 0,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autopurgefriends': {
      const doc = await AutoPurgeFriends.findOne({ discordId });
      if (!doc) return;
      const existing = doc.accounts.get(targetAccountId);
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        whitelist: existing?.whitelist ?? [],
        createdAt: existing?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    case 'autofreellamas': {
      const doc = await AutoFreeLlamas.findOne({ discordId });
      if (!doc) return;
      doc.accounts.set(targetAccountId, {
        isActive: true,
        accountId: targetAccountId,
        createdAt: doc.accounts.get(targetAccountId)?.createdAt ?? now,
        lastActivity: now,
      });
      doc.markModified('accounts');
      await doc.save();
      break;
    }

    // autosecurity, autoloadout, autosurvivors, autofriendalerts (friend list is per account) are unsyncable
  }
}
