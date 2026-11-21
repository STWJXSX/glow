/**
 * Central registry for all automatic systems.
 * Tier gates for /autoconfig, automation schedulers, and config commands.
 *
 * Tiers:
 *   free    — everyone (no premium)
 *   booster — Discord booster or paid Premium
 *   premium — single paid Glow Premium tier (unlocks all paid automations)
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

export type AutomationRequiredTier = 'free' | 'booster' | 'premium';

export interface AutomationSystemConfig {
  panelKey: AutoconfigPanelKey;
  policyKey: AutomationSystemKey;
  requiredTier: AutomationRequiredTier;
  /** Slash command used to configure this system (if any). */
  configCommand?: string;
}

export const AUTOMATION_SYSTEMS: readonly AutomationSystemConfig[] = [
  { panelKey: 'autokick', policyKey: 'autokick', requiredTier: 'premium', configCommand: 'autokick' },
  { panelKey: 'autosac', policyKey: 'autosac', requiredTier: 'free' },
  { panelKey: 'autodaily', policyKey: 'autodaily', requiredTier: 'free' },
  { panelKey: 'status', policyKey: 'statusfortnite', requiredTier: 'premium', configCommand: 'presence' },
  { panelKey: 'autoexpediciones', policyKey: 'autoexpediciones', requiredTier: 'premium' },
  { panelKey: 'autosecurity', policyKey: 'autosecurity', requiredTier: 'free', configCommand: 'security' },
  { panelKey: 'autobuyfreeitems', policyKey: 'autobuyfree', requiredTier: 'premium', configCommand: 'autobuy' },
  { panelKey: 'autobuyselected', policyKey: 'autobuyselected', requiredTier: 'premium', configCommand: 'autobuy' },
  { panelKey: 'reminder', policyKey: 'reminder', requiredTier: 'free', configCommand: 'reminder' },
  { panelKey: 'autoreroll', policyKey: 'autoreroll', requiredTier: 'premium', configCommand: 'daily' },
  { panelKey: 'autoacceptfriends', policyKey: 'autoacceptfriends', requiredTier: 'premium', configCommand: 'taxiprem' },
  { panelKey: 'autorecycle', policyKey: 'autorecycle', requiredTier: 'premium', configCommand: 'autorecycle' },
  { panelKey: 'autobuystw', policyKey: 'autobuystw', requiredTier: 'premium', configCommand: 'autobuy' },
  { panelKey: 'autopurgefriends', policyKey: 'autopurgefriends', requiredTier: 'premium', configCommand: 'purgefriends' },
  { panelKey: 'autoloadout', policyKey: 'autoloadout', requiredTier: 'premium', configCommand: 'autoloadout' },
  { panelKey: 'autosurvivors', policyKey: 'autosurvivors', requiredTier: 'premium', configCommand: 'survivors' },
  { panelKey: 'autofreellamas', policyKey: 'autofreellamas', requiredTier: 'free' },
  { panelKey: 'autofriendalerts', policyKey: 'autofriendalerts', requiredTier: 'premium', configCommand: 'friendalerts' },
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
    case 'premium':
      return 1;
    default:
      return 1;
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
    case 'premium':
      return 'Premium';
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
    case 'premium':
      return 1;
    default:
      return 1;
  }
}

export function isAutomationCommandGated(panelKey: AutoconfigPanelKey): boolean {
  if (isPremiumCheckBypassed()) return false;
  return getAutomationConfigByPanel(panelKey).requiredTier !== 'free';
}
