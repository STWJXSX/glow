import { getStwPowerLevel } from '#helpers/epic/stw/gameplay/stwPowerLevel.ts';
import { evalLobbyBlendPower } from '#helpers/epic/stw/gameplay/stwHomebaseRating.ts';
import { resolveStwRarity } from '#helpers/epic/stw/shop/stwShopCatalog.ts';

type ProfileItem = {
  templateId?: string;
  attributes?: Record<string, unknown>;
};

function itemLevel(item: ProfileItem): number {
  const level = item.attributes?.level;
  return typeof level === 'number' && Number.isFinite(level) ? Math.max(1, level) : 1;
}

function itemPower(item: ProfileItem): number {
  const templateId = String(item.templateId ?? '');
  if (!templateId) return 0;
  const rarity = resolveStwRarity(
    templateId,
    typeof item.attributes?.starting_rarity === 'string'
      ? item.attributes.starting_rarity
      : null,
  );
  return getStwPowerLevel(rarity, itemLevel(item));
}

function squadFortStat(squadId: string): 'fortitude' | 'offense' | 'resistance' | 'technology' | null {
  const id = squadId.toLowerCase();
  if (id.includes('medicine')) return 'fortitude';
  if (id.includes('arms')) return 'offense';
  if (id.includes('scavenging')) return 'technology';
  if (id.includes('synthesis')) return 'resistance';
  return null;
}

/**
 * Lobby PL from campaign profile items — mirrors client sub-ratings:
 * - loadout ≈ commander hero item PL
 * - backpack ≈ average squad-lead survivor item PL
 * - lobby ≈ floor(0.77×backpack + 0.23×loadout)
 */
export function computeLobbyPowerFromCampaignProfile(profile: Record<string, unknown>): number | null {
  const items = profile.items;
  if (!items || typeof items !== 'object') return null;

  const itemMap = items as Record<string, ProfileItem>;
  const attrs = (profile.stats as { attributes?: Record<string, unknown> } | undefined)?.attributes ?? {};
  const selectedLoadout = String(attrs.selected_hero_loadout ?? '').trim();

  let loadoutRating: number | null = null;
  if (selectedLoadout && itemMap[selectedLoadout]) {
    const loadoutItem = itemMap[selectedLoadout];
    const crew = (loadoutItem.attributes?.crew_members ?? {}) as Record<string, string>;
    const commanderGuid = String(crew.commanderslot ?? '').trim();
    if (commanderGuid && itemMap[commanderGuid]) {
      loadoutRating = itemPower(itemMap[commanderGuid]);
    }
  }

  const leadPowers: number[] = [];
  for (const item of Object.values(itemMap)) {
    const templateId = String(item.templateId ?? '');
    if (!templateId.toLowerCase().startsWith('worker:')) continue;

    const squadId = String(item.attributes?.squad_id ?? '').trim();
    const slotIndex = item.attributes?.squad_slot_idx;
    if (!squadId || slotIndex == null || Number(slotIndex) < 0) continue;
    if (!squadFortStat(squadId)) continue;

    // Slot 0 = squad lead (matches CampaignBackpackRating_d calibration).
    if (Number(slotIndex) === 0) {
      leadPowers.push(itemPower(item));
    }
  }

  const backpackRating = leadPowers.length > 0
    ? Math.round((leadPowers.reduce((a, b) => a + b, 0) / leadPowers.length) * 100) / 100
    : null;

  if (loadoutRating != null && backpackRating != null) {
    return evalLobbyBlendPower({ loadoutRating, backpackRating });
  }
  if (loadoutRating != null) return Math.floor(loadoutRating);
  if (backpackRating != null) return Math.floor(backpackRating);
  return null;
}
