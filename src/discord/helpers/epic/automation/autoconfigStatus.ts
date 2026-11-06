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
import AutoBuySTW from '#models/AutoBuySTW.ts';
import AutoPurgeFriends from '#models/AutoPurgeFriends.ts';
import AutoLoadout from '#models/AutoLoadout.ts';
import AutoSurvivors from '#models/AutoSurvivors.ts';
import AutoFreeLlamas from '#models/AutoFreeLlamas.ts';
import AutoFriendAlerts from '#models/AutoFriendAlerts.ts';
import { log } from '#helpers/core/logger.ts';

/** Keys aligned with /autoconfig panel (not API SystemName). */
export type AutoconfigPanelKey =
  | 'autokick'
  | 'autosac'
  | 'autodaily'
  | 'status'
  | 'autoexpediciones'
  | 'autosecurity'
  | 'autobuyfreeitems'
  | 'autobuyselected'
  | 'reminder'
  | 'autoreroll'
  | 'autoacceptfriends'
  | 'autorecycle'
  | 'autobuystw'
  | 'autopurgefriends'
  | 'autoloadout'
  | 'autosurvivors'
  | 'autofreellamas'
  | 'autofriendalerts';

export const AUTOCONFIG_PANEL_KEYS: AutoconfigPanelKey[] = [
  'autokick',
  'autosac',
  'autodaily',
  'status',
  'autoexpediciones',
  'autosecurity',
  'autobuyfreeitems',
  'autobuyselected',
  'reminder',
  'autoreroll',
  'autoacceptfriends',
  'autorecycle',
  'autobuystw',
  'autopurgefriends',
  'autoloadout',
  'autosurvivors',
  'autofreellamas',
  'autofriendalerts',
];

export function normalizeAutoconfigPanelKey(raw: string): AutoconfigPanelKey | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  const aliases: Record<string, AutoconfigPanelKey> = {
    statusfortnite: 'status',
    status: 'status',
    autobuyfree: 'autobuyfreeitems',
    autobuyfreeitems: 'autobuyfreeitems',
    autodailies: 'autodaily',
    autodaily: 'autodaily',
    autosac: 'autosac',
    sac: 'autosac',
    reminder: 'reminder',
    reminders: 'reminder',
    autoreroll: 'autoreroll',
    autokick: 'autokick',
    autoexpediciones: 'autoexpediciones',
    autosecurity: 'autosecurity',
    security: 'autosecurity',
    autobuyselected: 'autobuyselected',
    autoacceptfriends: 'autoacceptfriends',
    autorecycle: 'autorecycle',
    autobuystw: 'autobuystw',
    autopurgefriends: 'autopurgefriends',
    autoloadout: 'autoloadout',
    autosurvivors: 'autosurvivors',
    autofreellamas: 'autofreellamas',
    autofriendalerts: 'autofriendalerts',
    friendalerts: 'autofriendalerts',
  };
  return aliases[key] ?? null;
}

export type AutoconfigStatusMap = Record<AutoconfigPanelKey, boolean>;

export async function getAutoconfigStatusForAccount(
  discordId: string,
  accountId: string,
): Promise<AutoconfigStatusMap> {
  const status = {} as AutoconfigStatusMap;

  try {
    const autoKick = await AutoKick.findOne({ discordId });
    status.autokick = autoKick?.accounts?.get(accountId)?.isActive ?? false;

    const autoSAC = await AutoSAC.findOne({ discordId });
    status.autosac = autoSAC?.accounts?.get(accountId)?.isActive ?? false;

    const autoDaily = await AutoDaily.findOne({ discordId });
    status.autodaily = autoDaily?.accounts?.get(accountId)?.isActive ?? false;

    const statusFn = await StatusFortnite.findOne({ discordId, accountId });
    status.status = statusFn?.activo ?? false;

    const autoExp = await AutoExpediciones.findOne({ discordId });
    status.autoexpediciones = autoExp?.accounts?.get(accountId)?.isActive ?? false;

    const autoSec = await AutoSecuritySystem.findOne({ discordId });
    status.autosecurity = autoSec?.accounts?.get(accountId)?.isActive ?? false;

    const autoBuy = await AutoBuyFreeItems.findOne({ discordId });
    status.autobuyfreeitems = autoBuy?.accounts?.get(accountId)?.isActive ?? false;

    const autoBuySel = await AutoBuySelectedItems.findOne({ discordId });
    status.autobuyselected = autoBuySel?.accounts?.get(accountId)?.isActive ?? false;

    const reminderDoc = await Reminder.findOne({ discordId });
    status.reminder = reminderDoc?.accounts?.get(accountId)?.isActive ?? false;

    const autoReroll = await AutoReroll.findOne({ discordId });
    status.autoreroll = autoReroll?.accounts?.get(accountId)?.isActive ?? false;

    const autoAcceptFriends = await AutoAcceptFriends.findOne({ discordId });
    status.autoacceptfriends = autoAcceptFriends?.accounts?.get(accountId)?.isActive ?? false;

    const autoRecycle = await AutoRecycle.findOne({ discordId });
    status.autorecycle = autoRecycle?.accounts?.get(accountId)?.isActive ?? false;

    const autoBuySTW = await AutoBuySTW.findOne({ discordId });
    status.autobuystw = autoBuySTW?.accounts?.get(accountId)?.isActive ?? false;

    const autoPurgeFriends = await AutoPurgeFriends.findOne({ discordId });
    status.autopurgefriends = autoPurgeFriends?.accounts?.get(accountId)?.isActive ?? false;

    const autoLoadout = await AutoLoadout.findOne({ discordId });
    status.autoloadout = autoLoadout?.accounts?.get(accountId)?.isActive ?? false;

    const autoSurvivors = await AutoSurvivors.findOne({ discordId });
    status.autosurvivors = autoSurvivors?.accounts?.get(accountId)?.isActive ?? false;

    const autoFreeLlamas = await AutoFreeLlamas.findOne({ discordId });
    status.autofreellamas = autoFreeLlamas?.accounts?.get(accountId)?.isActive ?? false;

    const autoFriendAlerts = await AutoFriendAlerts.findOne({ discordId });
    status.autofriendalerts = autoFriendAlerts?.accounts?.get(accountId)?.isActive ?? false;
  } catch (error) {
    log.events.warn(
      { err: error, discordId, accountId },
      '[autoconfigStatus] Failed to read system status',
    );
  }

  return status;
}

export async function getAutoconfigExtraHint(
  discordId: string,
  accountId: string,
  system: AutoconfigPanelKey,
  active: boolean,
): Promise<string> {
  if (!active) return '';
  try {
    if (system === 'autosac') {
      const doc = await AutoSAC.findOne({ discordId });
      const code = doc?.accounts?.get(accountId)?.sacToSet;
      return code ? ` (${code})` : '';
    }
    if (system === 'status') {
      const doc = await StatusFortnite.findOne({ discordId, accountId });
      const msg = doc?.mensaje;
      return msg ? ` (${msg.slice(0, 24)}…)` : '';
    }
  } catch {
    /* ignore */
  }
  return '';
}
