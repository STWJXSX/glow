/**
 * Central registry for all automatic systems.
 * Tier gates for /autoconfig, automation schedulers, and config commands.
 *
 * Tiers:
 *   free     — everyone (no premium)
 *   booster  — Discord booster or any paid tier
 *   basic    — paid Basic+
 *   pro      — paid Pro+
 *   ultimate — paid Ultimate
 */

import type { AutoconfigPanelKey } from './autoconfigStatus.ts';
import { isPremiumCheckBypassed } from '#helpers/core/client/premium.ts';

export type AutomationSystemKey =
  | 'autosac'
  | 'autodaily'
  | 'autosecurity'
  | 'reminder'
  | 'autofreellamas'
  | 'autobuyfree'
  | 'autobuyselected'
  | 'autorecycle'
  | 'autobuystw'
  | 'autokick'
  | 'autoexpediciones'
  | 'autoreroll'
  | 'autoloadout'
  | 'autosurvivors'
  | 'autopurgefriends'
  | 'statusfortnite'
  | 'autoacceptfriends'
  | 'autofriendalerts';

export type AutomationRequiredTier = 'free' | 'booster' | 'basic' | 'pro' | 'ultimate';

export interface AutomationSystemConfig {
  panelKey: AutoconfigPanelKey;
  policyKey: AutomationSystemKey;
  requiredTier: AutomationRequiredTier;
  /** Slash command used to configure this system (if any). */
  configCommand?: string;
}

export const AUTOMATION_SYSTEMS: readonly AutomationSystemConfig[] = [
  { panelKey: 'autokick', policyKey: 'autokick', requiredTier: 'ultimate', configCommand: 'autokick' },
  { panelKey: 'autosac', policyKey: 'autosac', requiredTier: 'free' },
  { panelKey: 'autodaily', policyKey: 'autodaily', requiredTier: 'free' },
  { panelKey: 'status', policyKey: 'statusfortnite', requiredTier: 'ultimate', configCommand: 'status' },
  { panelKey: 'autoexpediciones', policyKey: 'autoexpediciones', requiredTier: 'ultimate' },
  { panelKey: 'autosecurity', policyKey: 'autosecurity', requiredTier: 'free', configCommand: 'security' },
  { panelKey: 'autobuyfreeitems', policyKey: 'autobuyfree', requiredTier: 'pro', configCommand: 'autobuy' },
  { panelKey: 'autobuyselected', policyKey: 'autobuyselected', requiredTier: 'pro', configCommand: 'autobuy' },
  { panelKey: 'reminder', policyKey: 'reminder', requiredTier: 'free', configCommand: 'reminder' },
  { panelKey: 'autoreroll', policyKey: 'autoreroll', requiredTier: 'ultimate', configCommand: 'daily' },
  { panelKey: 'autoacceptfriends', policyKey: 'autoacceptfriends', requiredTier: 'ultimate', configCommand: 'taxiprem' },
  { panelKey: 'autorecycle', policyKey: 'autorecycle', requiredTier: 'pro', configCommand: 'autorecycle' },
  { panelKey: 'autobuystw', policyKey: 'autobuystw', requiredTier: 'pro', configCommand: 'autobuy' },
  { panelKey: 'autopurgefriends', policyKey: 'autopurgefriends', requiredTier: 'ultimate', configCommand: 'purgefriends' },
  { panelKey: 'autoloadout', policyKey: 'autoloadout', requiredTier: 'ultimate', configCommand: 'autoloadout' },
  { panelKey: 'autosurvivors', policyKey: 'autosurvivors', requiredTier: 'ultimate', configCommand: 'survivors' },
  { panelKey: 'autofreellamas', policyKey: 'autofreellamas', requiredTier: 'free' },
  { panelKey: 'autofriendalerts', policyKey: 'autofriendalerts', requiredTier: 'ultimate', configCommand: 'friendalerts' },
] as const;

const byPanel = new Map<AutoconfigPanelKey, AutomationSystemConfig>();
const byPolicy = new Map<AutomationSystemKey, AutomationSystemConfig>();

for (const entry of AUTOMATION_SYSTEMS) {
  byPanel.set(entry.panelKey, entry);
  byPolicy.set(entry.policyKey, entry);
}

export const AUTOCONFIG_KEY_TO_SYSTEM: Record<string, AutomationSystemKey> = Object.fromEntries(
  AUTOMATION_SYSTEMS.map((entry) => [entry.panelKey, entry.policyKey]),
) as Record<string, AutomationSystemKey>;

export function getAutomationConfigByPanel(panelKey: AutoconfigPanelKey): AutomationSystemConfig {
  const entry = byPanel.get(panelKey);
  if (!entry) throw new Error(`Unknown autoconfig panel key: ${panelKey}`);
  return entry;
}

export function getAutomationConfigByPolicy(policyKey: AutomationSystemKey): AutomationSystemConfig {
  const entry = byPolicy.get(policyKey);
  if (!entry) throw new Error(`Unknown automation policy key: ${policyKey}`);
  return entry;
}

export function resolveAutomationConfig(
  key: AutoconfigPanelKey | AutomationSystemKey,
): AutomationSystemConfig {
  if (byPanel.has(key as AutoconfigPanelKey)) {
    return getAutomationConfigByPanel(key as AutoconfigPanelKey);
  }
  return getAutomationConfigByPolicy(key as AutomationSystemKey);
}

export function requiredTierToMinPaidLevel(tier: AutomationRequiredTier): number {
  switch (tier) {
    case 'free':
    case 'booster':
      return 0;
    case 'basic':
      return 1;
    case 'pro':
      return 2;
    case 'ultimate':
      return 3;
    default:
      return 3;
  }
}

export function autoconfigRequiresPremium(panelKey: AutoconfigPanelKey): boolean {
  if (isPremiumCheckBypassed()) return false;
  return getAutomationConfigByPanel(panelKey).requiredTier !== 'free';
}

export function automationMinPaidLevel(policyKey: AutomationSystemKey): number {
  return requiredTierToMinPaidLevel(getAutomationConfigByPolicy(policyKey).requiredTier);
}

export function buildAutomationMinTierMap(): Record<AutomationSystemKey, number> {
  const map = {} as Record<AutomationSystemKey, number>;
  for (const entry of AUTOMATION_SYSTEMS) {
    map[entry.policyKey] = requiredTierToMinPaidLevel(entry.requiredTier);
  }
  return map;
}

/** Paid-tier automation access (schedulers / cleanup). Booster-tier systems stay enabled for everyone. */
export function canAccessAutomationPaid(
  paidTierLevel: number,
  policyKey: AutomationSystemKey,
): boolean {
  if (isPremiumCheckBypassed()) return true;
  const { requiredTier } = getAutomationConfigByPolicy(policyKey);
  if (requiredTier === 'free' || requiredTier === 'booster') return true;
  return paidTierLevel >= requiredTierToMinPaidLevel(requiredTier);
}

/** Full access check for /autoconfig and config commands (includes booster tier). */
export function canAccessAutomationSystem(
  paidTierLevel: number,
  canUsePremiumCommands: boolean,
  key: AutoconfigPanelKey | AutomationSystemKey,
): boolean {
  if (isPremiumCheckBypassed()) return true;
  const { requiredTier } = resolveAutomationConfig(key);
  if (requiredTier === 'free') return true;
  if (requiredTier === 'booster') return canUsePremiumCommands;
  return paidTierLevel >= requiredTierToMinPaidLevel(requiredTier);
}

export function automationRequiredTierLabel(tier: AutomationRequiredTier): string {
  switch (tier) {
    case 'free':
      return 'Free';
    case 'booster':
      return 'Booster';
    case 'basic':
      return 'Basic';
    case 'pro':
      return 'Pro';
    case 'ultimate':
      return 'Ultimate';
    default:
      return 'Premium';
  }
}

export function automationPremiumEmojiTier(requiredTier: AutomationRequiredTier): number | null {
  if (isPremiumCheckBypassed()) return null;
  switch (requiredTier) {
    case 'free':
    case 'booster':
      return null;
    case 'basic':
      return 1;
    case 'pro':
      return 2;
    case 'ultimate':
      return 3;
    default:
      return 3;
  }
}

export function isAutomationCommandGated(panelKey: AutoconfigPanelKey): boolean {
  if (isPremiumCheckBypassed()) return false;
  return getAutomationConfigByPanel(panelKey).requiredTier !== 'free';
}
