import type { Client } from 'discord.js';
import type { Document, Model } from 'mongoose';
import UsuarioInfo, { type IDeviceAuth, type IUsuarioInfo } from '#models/UsuarioInfo.ts';
import AutoDaily from '#models/AutoDaily.ts';
import AutoSAC from '#models/AutoSAC.ts';
import AutoSecuritySystem from '#models/AutoSecuritySystem.ts';
import AutoBuyFreeItems from '#models/AutoBuyFreeItems.ts';
import AutoBuySelectedItems from '#models/AutoBuySelectedItems.ts';
import AutoPurgeFriends from '#models/AutoPurgeFriends.ts';
import AutoBuySTW from '#models/AutoBuySTW.ts';
import AutoRecycle from '#models/AutoRecycle.ts';
import AutoReroll from '#models/AutoReroll.ts';
import AutoKick from '#models/AutoKick.ts';
import AutoExpediciones from '#models/AutoExpediciones.ts';
import AutoLoadout from '#models/AutoLoadout.ts';
import AutoSurvivors from '#models/AutoSurvivors.ts';
import AutoFreeLlamas from '#models/AutoFreeLlamas.ts';
import AutoFriendAlerts from '#models/AutoFriendAlerts.ts';
import AutoAcceptFriends from '#models/AutoAcceptFriends.ts';
import StatusFortnite from '#models/StatusFortnite.ts';
import Reminder from '#models/Reminder.ts';
import { log } from '#helpers/core/logger.ts';
import { getUserLanguage } from '#helpers/locales/index.ts';
import { buildAutomationAuthExpiredEmbed, buildAccountRemovedMessage, type RemovedAccountSnapshot } from './automationEmbedBuilders.ts';
import { sendAutomationUserDm } from './automationNotify.ts';
import type { AutomationSystemKey } from './config.ts';
import type { DeviceAuthRevocationCheck } from '../auth/tokenRefresh.ts';
import { getAutomationConfigByPolicy } from './config.ts';
import { plainAccountEntry } from './accountEntry.ts';

type AccountsDoc = Document & {
  discordId: string;
  accounts: Map<string, Record<string, unknown>>;
  markModified(path: string): void;
  save(): Promise<unknown>;
};


/** Set by the process that keeps Fortnite status connections, to drop one when its entry is removed. */
let statusRemovedHook: ((discordId: string, accountId: string) => Promise<void>) | null = null;

export function setStatusRemovedHook(fn: (discordId: string, accountId: string) => Promise<void>): void {
  statusRemovedHook = fn;
}
const AUTOMATION_DOCS = [
  AutoDaily,
  AutoSAC,
  AutoSecuritySystem,
  AutoBuyFreeItems,
  AutoBuySelectedItems,
  AutoPurgeFriends,
  AutoBuySTW,
  AutoRecycle,
  AutoReroll,
  AutoKick,
  AutoExpediciones,
  AutoLoadout,
  AutoSurvivors,
  AutoFreeLlamas,
  AutoFriendAlerts,
  AutoAcceptFriends,
  StatusFortnite,
  Reminder,
] as const;

function findDeviceAuth(userInfo: IUsuarioInfo, accountId: string): IDeviceAuth | undefined {
  return userInfo.deviceAuths.find((a) => a.accountId === accountId);
}

export function isUsuarioAutomationSuspended(
  userInfo: IUsuarioInfo | null | undefined,
  accountId: string,
): boolean {
  const auth = userInfo?.deviceAuths?.find((a) => a.accountId === accountId);
  return auth?.automationSuspended === true;
}

function patchAccountEntry(
  doc: AccountsDoc,
  accountId: string,
): boolean {
  let changed = false;
  for (const [key, data] of doc.accounts) {
    const entryAccountId = (data as { accountId?: string }).accountId ?? key;
    if (entryAccountId !== accountId && key !== accountId) continue;

    // isActive is left untouched so clearAutomationDocs can resume the system after a re-link
    doc.accounts.set(key, {
      ...plainAccountEntry(data),
      suspended: true,
      suspendedReason: 'tokenFailure',
      suspendedAt: new Date(),
    });
    changed = true;
  }
  return changed;
}

export async function suspendAutomationDocsOnly(discordId: string, accountId: string): Promise<void> {
  for (const Model of AUTOMATION_DOCS) {
    try {
      const doc = await (Model as unknown as Model<any>).findOne({ discordId }) as AccountsDoc | null;
      if (!doc?.accounts?.size) continue;
      if (!patchAccountEntry(doc, accountId)) continue;
      doc.markModified('accounts');
      await doc.save();
    } catch (err) {
      log.epic.warn({ discordId, accountId, model: Model.modelName, err }, '[TokenFailure] suspend doc failed');
    }
  }
}

async function clearAutomationDocs(discordId: string, accountId: string): Promise<void> {
  for (const Model of AUTOMATION_DOCS) {
    try {
      const doc = await (Model as unknown as Model<any>).findOne({ discordId }) as AccountsDoc | null;
      if (!doc?.accounts?.size) continue;

      let changed = false;
      for (const [key, data] of doc.accounts) {
        const entryAccountId = (data as { accountId?: string }).accountId ?? key;
        if (entryAccountId !== accountId && key !== accountId) continue;
        if (!(data as { suspended?: boolean }).suspended) continue;

        doc.accounts.set(key, {
          ...plainAccountEntry(data),
          suspended: false,
          suspendedReason: '',
          suspendedAt: null,
        });
        changed = true;
      }
      if (!changed) continue;
      doc.markModified('accounts');
      await doc.save();
    } catch (err) {
      log.epic.warn({ discordId, accountId, model: Model.modelName, err }, '[TokenFailure] clear doc failed');
    }
  }
}

export interface MarkAutomationTokenFailureParams {
  client: Client;
  discordId: string;
  userInfo: IUsuarioInfo;
  accountId: string;
  displayName: string;
  sourceSystem: AutomationSystemKey;
}

type AccountsModel = {
  modelName: string;
  findOne(q: object): { lean(): Promise<{ _id: unknown; accounts?: Record<string, Record<string, unknown>> } | null> };
  updateOne(q: object, u: object): Promise<unknown>;
};

/**
 * Deletes every automation entry of the account and returns what it had (for the DM / backup file).
 * Uses an atomic $unset per entry so settings of the user's other accounts are never overwritten.
 */
async function removeAccountFromAutomationDocs(
  discordId: string,
  accountId: string,
): Promise<RemovedAccountSnapshot['systems']> {
  const removed: RemovedAccountSnapshot['systems'] = [];
  // Mongoose drops undefined filter values, which would match ANY user
  if (!discordId || !accountId) return removed;

  for (const Model of AUTOMATION_DOCS as unknown as AccountsModel[]) {
    try {
      const doc = await Model.findOne({ discordId }).lean();
      if (!doc?.accounts) continue;

      const unset: Record<string, 1> = {};
      for (const [key, data] of Object.entries(doc.accounts)) {
        const entryAccountId = (data?.accountId as string | undefined) ?? key;
        if (entryAccountId !== accountId && key !== accountId) continue;
        removed.push({ system: Model.modelName, isActive: data?.isActive === true, settings: JSON.parse(JSON.stringify(data)) });
        unset[`accounts.${key}`] = 1;
      }
      if (!Object.keys(unset).length) continue;
      await Model.updateOne({ _id: doc._id }, { $unset: unset });
    } catch (err) {
      log.epic.warn({ discordId, accountId, model: Model.modelName, err }, '[TokenFailure] remove doc entry failed');
    }
  }

  // StatusFortnite stores one document per account (no `accounts` map), so the loop above never sees it
  // and the status keeper would retry the account forever.
  try {
    const statuses = await StatusFortnite.find({ discordId, accountId }).lean();
    if (statuses.length) {
      for (const s of statuses) {
        removed.push({ system: StatusFortnite.modelName, isActive: s.activo === true, settings: JSON.parse(JSON.stringify(s)) });
      }
      await StatusFortnite.deleteMany({ discordId, accountId });
      await statusRemovedHook?.(discordId, accountId).catch(() => undefined);
    }
  } catch (err) {
    log.epic.warn({ discordId, accountId, err }, '[TokenFailure] remove status entry failed');
  }
  return removed;
}

/**
 * Removes the automation entries of an Epic account that is no longer linked, so no system keeps running on it.
 * Callers may hold an old copy of the user (XMPP pool, long loops), so the DB is checked first:
 * nothing is removed while the account is still linked there.
 */
export async function purgeUnlinkedAccount(discordId: string, accountId: string): Promise<boolean> {
  if (!discordId || !accountId) return false;
  const fresh = await UsuarioInfo.findOne({ id: discordId })
    .select('deviceAuths.accountId')
    .lean<{ deviceAuths?: { accountId: string }[] }>();
  if (fresh?.deviceAuths?.some((a) => a.accountId === accountId)) return false;

  const removed = await removeAccountFromAutomationDocs(discordId, accountId);
  if (removed.length) {
    log.epic.warn(
      { discordId, accountId, systems: removed.map((s) => s.system) },
      '[TokenFailure] Account no longer linked — its automation entries were removed',
    );
  }
  return true;
}

let registeredClient: Client | null = null;

/** Lets token refresh (which has no Discord client of its own) DM users when their account is removed. */
export function registerTokenFailureClient(client: Client): void {
  registeredClient = client;
}

/** For callers without their own Discord client (XMPP status manager). */
export function getTokenFailureClient(): Client | null {
  return registeredClient;
}

const removalsInFlight = new Set<string>();

// Circuit breaker: if Epic (or a bug) starts rejecting many accounts at once, stop removing and only suspend.
const MAX_REMOVALS_PER_HOUR = 10;
const recentRemovals: number[] = [];

function takeRemovalSlot(): boolean {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (recentRemovals.length && recentRemovals[0]! < cutoff) recentRemovals.shift();
  if (recentRemovals.length >= MAX_REMOVALS_PER_HOUR) return false;
  recentRemovals.push(Date.now());
  return true;
}

/**
 * Reloads the caller's in-memory user from the DB. After the array shrinks, a stale copy would
 * write tokens into the wrong slot (mongoose saves subdocuments by index).
 */
async function resyncUserDoc(userInfo: IUsuarioInfo): Promise<void> {
  try {
    const raw = await UsuarioInfo.findOne({ id: userInfo.id }).lean();
    if (raw) userInfo.init(raw);
  } catch (err) {
    log.epic.warn({ discordId: userInfo.id, err }, '[TokenFailure] Could not resync user document');
  }
}

export type RevokedAccountOutcome =
  /** The account was removed from the bot (or was already gone): stop using it. */
  | 'removed'
  /** It still works, or it changed meanwhile: skip this run, do not suspend. */
  | 'kept'
  /** Revocation could not be confirmed: fall back to the usual suspension. */
  | 'unconfirmed';

/**
 * Called by refreshAccountToken when ANDROID answered invalid_account_credentials for the device auth.
 * Nothing is removed unless: a Discord client is available to tell the user, the rejection repeats
 * with the credentials currently stored in the DB (callers like the XMPP pool may hold a copy from
 * before a re-link), and fewer than MAX_REMOVALS_PER_HOUR accounts were removed in the last hour.
 */
export async function handleRevokedAccount(
  userInfo: IUsuarioInfo,
  accountId: string,
  confirmRevoked: (discordId: string, accountId: string) => Promise<DeviceAuthRevocationCheck>,
): Promise<RevokedAccountOutcome> {
  const discordId = userInfo.id;
  const client = registeredClient;
  // Without a client the user could not be told: never remove silently
  if (!discordId || !accountId || !client) return 'unconfirmed';

  const key = `${discordId}:${accountId}`;
  if (removalsInFlight.has(key)) return 'kept';
  removalsInFlight.add(key);
  try {
    const check = await confirmRevoked(discordId, accountId);

    if (check.status === 'unlinked') {
      await purgeUnlinkedAccount(discordId, accountId);
      await resyncUserDoc(userInfo);
      return 'removed';
    }
    if (check.status === 'alive') {
      await resyncUserDoc(userInfo);
      return 'kept';
    }
    if (check.status !== 'revoked') return 'unconfirmed';

    if (!takeRemovalSlot()) {
      log.epic.error(
        { discordId, accountId, limit: MAX_REMOVALS_PER_HOUR },
        '[TokenFailure] Too many revoked accounts this hour — suspending instead of removing',
      );
      return 'unconfirmed';
    }

    const removed = await removeRevokedAccount(client, discordId, check.auth);
    await resyncUserDoc(userInfo);
    return removed ? 'removed' : 'kept';
  } catch (err) {
    log.epic.error({ discordId, accountId, err }, '[TokenFailure] Revoked-account handling failed — nothing removed');
    return 'unconfirmed';
  } finally {
    removalsInFlight.delete(key);
  }
}

/** Definitive token failure: drop the account from the bot and tell the user how to get it back. */
async function removeRevokedAccount(client: Client, discordId: string, auth: IDeviceAuth): Promise<boolean> {
  const { accountId, deviceId, secret } = auth;
  const credential = { accountId, deviceId, secret };

  // Atomic and tied to the exact credential Epic rejected, so a re-link done meanwhile is never touched.
  // __v is bumped so stale in-memory copies fail with a VersionError instead of writing into shifted slots.
  const res = await UsuarioInfo.updateOne(
    { id: discordId, deviceAuths: { $elemMatch: credential } },
    { $pull: { deviceAuths: credential }, $inc: { __v: 1 } },
  );
  if (res.modifiedCount === 0) {
    log.epic.warn({ discordId, accountId }, '[TokenFailure] Credentials changed before removal — account kept');
    return false;
  }

  const systems = await removeAccountFromAutomationDocs(discordId, accountId);
  const snapshot: RemovedAccountSnapshot = {
    displayName: auth.displayName || accountId,
    accountId,
    wasMain: auth.cuentaMain === true,
    systems,
  };

  log.epic.warn(
    { accountId, discordId, wasMain: snapshot.wasMain, removedSystems: systems.map((s) => s.system) },
    '[TokenFailure] Epic rejected the login definitively — account removed from the bot',
  );

  const lang = await getUserLanguage(discordId);
  const message = buildAccountRemovedMessage(snapshot, lang);
  try {
    await sendAutomationUserDm(client, discordId, message, { system: 'accountRemoved', kind: 'error' });
  } catch {
    // DMs closed
  }
  return true;
}

/**
 * H2: suspend automation for this Epic account (no delete), DM once, skip Epic calls until re-link.
 * Definitive rejections are handled earlier by refreshAccountToken (handleRevokedAccount), which
 * removes the account instead. Entries pointing at an account that is no longer linked are purged.
 */
export async function markAutomationTokenFailure(params: MarkAutomationTokenFailureParams): Promise<void> {
  const { client, discordId, userInfo, accountId, displayName, sourceSystem } = params;
  const auth = findDeviceAuth(userInfo, accountId);
  if (!auth) {
    await purgeUnlinkedAccount(discordId, accountId);
    return;
  }

  const alreadySuspended = auth.automationSuspended === true;

  auth.automationSuspended = true;
  auth.automationSuspendedAt = new Date().toISOString();
  await userInfo.save();

  await suspendAutomationDocsOnly(discordId, accountId);

  if (alreadySuspended) {
    log.epic.debug({ accountId, sourceSystem }, '[TokenFailure] already suspended — skip DM');
    return;
  }

  const lang = await getUserLanguage(discordId);
  const systemLabel = getAutomationConfigByPolicy(sourceSystem).panelKey;
  const embed = buildAutomationAuthExpiredEmbed(displayName, lang, systemLabel);

  try {
    await sendAutomationUserDm(client, discordId, { embeds: [embed] }, {
      system: sourceSystem,
      kind: 'error',
    });
  } catch {
    // DMs closed
  }

  log.epic.warn({ accountId, discordId, sourceSystem }, '[TokenFailure] automation suspended — auth expired');
}

export async function clearAutomationSuspension(
  discordId: string,
  accountId: string,
): Promise<void> {
  const user = await UsuarioInfo.findOne({ id: discordId });
  if (!user) return;

  const auth = findDeviceAuth(user, accountId);
  if (auth?.automationSuspended) {
    auth.automationSuspended = false;
    auth.automationSuspendedAt = null;
    await user.save();
  }

  await clearAutomationDocs(discordId, accountId);
}

export function clearAutomationSuspensionOnDeviceAuth(
  userInfo: IUsuarioInfo,
  accountId: string,
): void {
  const auth = findDeviceAuth(userInfo, accountId);
  if (!auth) return;
  auth.automationSuspended = false;
  auth.automationSuspendedAt = null;
}

export function resolveAutomationDisplayName(
  userInfo: IUsuarioInfo,
  accountId: string,
  fallback?: string,
): string {
  return userInfo.deviceAuths.find((a) => a.accountId === accountId)?.displayName
    ?? fallback
    ?? accountId;
}
