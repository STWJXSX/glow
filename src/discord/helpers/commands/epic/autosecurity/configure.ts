import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js';
import AutoSecuritySystem from '#models/AutoSecuritySystem.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicCredentialError,
} from '../epicEmbedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { EPIC_PANEL_IDLE_MS, editReplyInactive } from '../epicCollectorHelper.ts';
import { DEFAULT_AUTO_SECURITY_SETTINGS, type IAccountSecuritySnapshot, type IAutoSecuritySettings } from '#helpers/epic/automation/autoSecurity/types.ts';
import { resolveSettings } from '#helpers/epic/automation/autoSecurity/accountData.ts';
import type { IAccountSecurity, IAutoSecuritySettings as ModelSettings } from '#models/AutoSecuritySystem.ts';
import { callCore } from '#api/glowCore.ts';

type ToggleKey = keyof IAutoSecuritySettings;

const TOGGLE_KEYS: ToggleKey[] = [
  'watchExternalAuths',
  'watch2fa',
  'watchEmailVerified',
  'watchDisplayName',
  'watchLoginActivity',
  'watchGeoOnKnownDevices',
  'watchRemovedDevices',
  'panicMode',
  'killOtherSessionsOnRevoke',
];

function cfgBtnId(accountId: string, key: string): string {
  return `glow:asec:cfg:${accountId}:${key}`;
}

function powerBtnId(accountId: string): string {
  return `glow:asec:power:${accountId}`;
}

function parseCfgBtn(customId: string): { accountId: string; key: ToggleKey } | null {
  if (!customId.startsWith('glow:asec:cfg:')) return null;
  const parts = customId.split(':');
  if (parts.length < 5) return null;
  const accountId = parts[3];
  const key = parts[4] as ToggleKey;
  if (!TOGGLE_KEYS.includes(key)) return null;
  return { accountId, key };
}

function parsePowerBtn(customId: string): string | null {
  if (!customId.startsWith('glow:asec:power:')) return null;
  const parts = customId.split(':');
  if (parts.length < 4) return null;
  return parts[3];
}

async function formatSettingsLines(
  discordId: string,
  settings: ModelSettings,
  locale: string,
): Promise<string[]> {
  const lines: string[] = [];
  for (const key of TOGGLE_KEYS) {
    const on = settings[key as ToggleKey];
    const label = await translateForUser(discordId, `autosecurity.cmd.config.toggles.${key}`, undefined, locale);
    const state = on
      ? await translateForUser(discordId, 'autosecurity.cmd.config.on', undefined, locale)
      : await translateForUser(discordId, 'autosecurity.cmd.config.off', undefined, locale);
    lines.push(epicQuote(`**${label}:** ${state}`));
  }
  return lines;
}

async function buildStatusBlock(
  client: ChatInputCommandInteraction['client'],
  discordId: string,
  accountName: string,
  isActive: boolean,
  locale: string,
): Promise<string[]> {
  const header = await translateForUser(discordId, 'autosecurity.cmd.info.header', undefined, locale);
  const lines: string[] = [epicSection(header)];

  if (isActive) {
    lines.push(
      epicEmojiLine(
        client,
        'active',
        `**${accountName}** — ${await translateForUser(discordId, 'autosecurity.cmd.info.active', undefined, locale)}`,
      ),
      '',
    );
  } else {
    lines.push(
      epicEmojiLine(
        client,
        'inactive',
        await translateForUser(discordId, 'autosecurity.cmd.info.notActive', { account: accountName }, locale),
      ),
      '',
    );
  }

  return lines;
}

async function buildPowerRow(
  accountId: string,
  isActive: boolean,
  discordId: string,
  locale: string,
): Promise<ActionRowBuilder<ButtonBuilder>> {
  const label = isActive
    ? await translateForUser(discordId, 'autosecurity.cmd.config.powerActive', undefined, locale)
    : await translateForUser(discordId, 'autosecurity.cmd.config.powerInactive', undefined, locale);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(powerBtnId(accountId))
      .setLabel(label.slice(0, 80))
      .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Danger),
  );
}

async function buildToggleRows(
  accountId: string,
  settings: ModelSettings,
  discordId: string,
  locale: string,
): Promise<ActionRowBuilder<ButtonBuilder>[]> {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let current = new ActionRowBuilder<ButtonBuilder>();
  for (const key of TOGGLE_KEYS) {
    const on = settings[key as ToggleKey];
    const label = await translateForUser(discordId, `autosecurity.cmd.config.toggleShort.${key}`, undefined, locale);
    if (current.components.length >= 5) {
      rows.push(current);
      current = new ActionRowBuilder<ButtonBuilder>();
    }
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(cfgBtnId(accountId, key))
        .setLabel(label.slice(0, 80))
        .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
  }
  if (current.components.length) rows.push(current);
  return rows;
}

async function activateAccountSecurity(
  discordId: string,
  accountId: string,
  existing?: IAccountSecurity,
): Promise<IAccountSecurity> {
  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo) {
    throw new Error('no_user');
  }

  let snapshot = existing?.snapshot;
  let knownDeviceIds = existing?.knownDeviceIds ?? [];

  const { account } = await refreshAccountToken(userInfo, accountId);
  if (account) {
    try {
      const baseline = await callCore<IAccountSecuritySnapshot>(
        'automation.autoSecurity.captureBaseline',
        account.accountId,
        account.accessToken,
      );
      snapshot = baseline;
      knownDeviceIds = baseline.knownDeviceIds;
    } catch {
      // keep prior snapshot if refresh fails
    }
  }

  const settings = resolveSettings(existing ?? {});
  return {
    isActive: true,
    accountId,
    knownDeviceIds,
    snapshot,
    settings,
    lastChecked: new Date(),
    createdAt: existing?.createdAt ?? new Date(),
    lastActivity: new Date(),
    suspended: false,
    suspendedReason: '',
  };
}

async function saveAccountEntry(discordId: string, accountId: string, entry: IAccountSecurity): Promise<void> {
  let doc = await AutoSecuritySystem.findOne({ discordId });
  if (!doc) {
    doc = new AutoSecuritySystem({ discordId, accounts: new Map() });
  }
  doc.accounts.set(accountId, entry);
  doc.markModified('accounts');
  await doc.save();
}

export async function handleSecurityPanel(
  interaction: ChatInputCommandInteraction,
  mainAccount: { accountId: string; displayName: string },
  discordId: string,
): Promise<void> {
  const client = interaction.client;
  const locale = interaction.locale;
  const accountId = mainAccount.accountId;
  const authorData = await getEpicAuthor(discordId);
  const accountName = authorData?.name ?? mainAccount.displayName;

  let doc = await AutoSecuritySystem.findOne({ discordId });
  let accountData = doc?.accounts?.get(accountId);
  let isActive = Boolean(accountData?.isActive);
  let settings: ModelSettings = {
    ...DEFAULT_AUTO_SECURITY_SETTINGS,
    ...resolveSettings(accountData ?? {}),
  };

  const buildDescription = async () => {
    const statusLines = await buildStatusBlock(client, discordId, accountName, isActive, locale);
    const intro = await translateForUser(
      discordId,
      'autosecurity.cmd.config.description',
      { displayName: mainAccount.displayName },
      locale,
    );
    const toggleLines = isActive ? await formatSettingsLines(discordId, settings, locale) : [];

    const parts = [...statusLines, intro];
    if (toggleLines.length) {
      parts.push('', ...toggleLines);
    }
    return parts.join('\n');
  };

  const buildComponents = async () => {
    const power = await buildPowerRow(accountId, isActive, discordId, locale);
    if (!isActive) return [power];
    const toggles = await buildToggleRows(accountId, settings, discordId, locale);
    return [power, ...toggles];
  };

  const payload = await buildEpicReplyPayload(
    discordId,
    {
      style: 'info',
      title: await translateForUser(discordId, 'autosecurity.cmd.config.title', undefined, locale),
      description: await buildDescription(),
      footerKey: 'brand',
      author: authorData,
    },
    interaction,
    locale,
  );

  const msg = await interaction.editReply({
    ...payload,
    components: await buildComponents(),
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: EPIC_PANEL_IDLE_MS,
    filter: (i) => i.user.id === discordId && i.customId.startsWith('glow:asec:'),
  });

  const refreshPanel = async (btn?: { update: (o: object) => Promise<unknown> }) => {
    doc = await AutoSecuritySystem.findOne({ discordId });
    accountData = doc?.accounts?.get(accountId);
    isActive = Boolean(accountData?.isActive);
    settings = { ...DEFAULT_AUTO_SECURITY_SETTINGS, ...resolveSettings(accountData ?? {}) };

    const nextPayload = await buildEpicReplyPayload(
      discordId,
      {
        style: 'info',
        title: await translateForUser(discordId, 'autosecurity.cmd.config.title', undefined, locale),
        description: await buildDescription(),
        footerKey: 'brand',
        author: authorData,
      },
      interaction,
      locale,
    );

    const body = { ...nextPayload, components: await buildComponents() };
    if (btn) await btn.update(body);
    else await interaction.editReply(body);
  };

  collector.on('collect', async (btn) => {
    const powerAccountId = parsePowerBtn(btn.customId);
    if (powerAccountId && powerAccountId === accountId) {
      if (isActive) {
        const entry = doc?.accounts?.get(accountId);
        if (entry) {
          await saveAccountEntry(discordId, accountId, {
            ...entry,
            isActive: false,
            lastActivity: new Date(),
          });
        }
      } else {
        const entry = await activateAccountSecurity(discordId, accountId, doc?.accounts?.get(accountId));
        await saveAccountEntry(discordId, accountId, entry);
      }
      await refreshPanel(btn);
      return;
    }

    const parsed = parseCfgBtn(btn.customId);
    if (!parsed || parsed.accountId !== accountId || !isActive) return;

    const toggleKey = parsed.key as ToggleKey;
    settings = { ...settings, [toggleKey]: !settings[toggleKey] };

    const entry = doc?.accounts?.get(accountId);
    if (entry) {
      await saveAccountEntry(discordId, accountId, {
        ...entry,
        settings,
        lastActivity: new Date(),
      });
    }

    await refreshPanel(btn);
  });

  collector.on('end', async (_collected, reason) => {
    if (reason !== 'idle') return;
    const inactive = await translateForUser(discordId, 'autosecurity.cmd.errors.timeout', undefined, locale);
    await editReplyInactive(interaction, inactive);
  });
}

export async function ensureAutoSecurityUser(
  interaction: ChatInputCommandInteraction,
  discordId: string,
): Promise<{ accountId: string; displayName: string } | null> {
  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, discordId, 'noCuenta');
    return null;
  }
  const mainAccount = userInfo.deviceAuths.find((a: { cuentaMain?: boolean }) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, discordId, 'noMain');
    return null;
  }
  return { accountId: mainAccount.accountId, displayName: mainAccount.displayName };
}
