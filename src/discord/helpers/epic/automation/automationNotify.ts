/**
 * Automation DMs to the account owner (no developer mirror),
 * gated by per-user /dm preferences when a system key is provided.
 */

import { type Client, type Message, type MessageCreateOptions } from 'discord.js';
import UserAutomationDM from '#models/UserAutomationDM.ts';
import { log } from '#helpers/core/logger.ts';
import type { AutoconfigPanelKey } from './autoconfigStatus.ts';

/** Autoconfig systems that send DMs to the user. */
export const AUTOMATION_DM_SYSTEMS = [
  'autokick',
  'autosac',
  'autodaily',
  'autoexpediciones',
  'autosecurity',
  'autobuyfreeitems',
  'autobuyselected',
  'reminder',
  'autoreroll',
  'autorecycle',
  'autobuystw',
  'autopurgefriends',
  'autofreellamas',
  'autofriendalerts',
] as const satisfies readonly AutoconfigPanelKey[];

export type AutomationDmSystemKey = (typeof AUTOMATION_DM_SYSTEMS)[number];

/** Returns the set of automation systems with DMs disabled for this user. */
export async function getDisabledAutomationDmSystems(
  discordId: string,
): Promise<Set<AutomationDmSystemKey>> {
  try {
    const doc = await UserAutomationDM.findOne({ discordId })
      .select('disabledSystems')
      .lean();
    const valid = new Set<string>(AUTOMATION_DM_SYSTEMS);
    const list = (doc?.disabledSystems ?? []).filter((k): k is AutomationDmSystemKey =>
      valid.has(k),
    );
    return new Set(list);
  } catch (err: any) {
    log.epic.warn(
      { discordId, error: err?.message },
      '[AutomationDM] Failed to read user DM preferences',
    );
    return new Set();
  }
}

/** Returns true if automation DMs are enabled for the user and system (enabled by default). */
export async function isAutomationDmEnabled(
  discordId: string,
  system: AutomationDmSystemKey,
): Promise<boolean> {
  const disabled = await getDisabledAutomationDmSystems(discordId);
  return !disabled.has(system);
}

/**
 * Send an automation DM to the user.
 * When `system` is provided and the user has disabled DMs for it via /dm, returns null without sending.
 * Throws if the DM cannot be delivered (e.g. DMs closed).
 */
export async function sendAutomationUserDm(
  client: Client,
  discordId: string,
  options: MessageCreateOptions,
  system?: AutomationDmSystemKey,
): Promise<Message | null> {
  if (system && !(await isAutomationDmEnabled(discordId, system))) {
    log.epic.debug(
      { discordId, system },
      '[AutomationDM] Skipped DM (disabled by user via /dm)',
    );
    return null;
  }

  const user = await client.users.fetch(discordId);
  return user.send(options);
}
