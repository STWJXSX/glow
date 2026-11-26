import type { Client } from 'discord.js';
import { getEmoji } from '#helpers/core/emojis.ts';
import { e, eAsset } from '#helpers/epic/stw/alerts/emojiMap.ts';
import type { StwMskWeapons, MskWeaponFamily } from './stwProfileHelpers.ts';

const MSK_EMOJI_NAME: Record<MskWeaponFamily, string> = {
  blunt_hammer_stormking: 'msk_hammer',
  edged_sword_stormking: 'msk_sword',
  assault_stormking: 'msk_assault',
  explosive_stormking: 'msk_launcher',
  pistol_stormking: 'msk_pistol',
};

const MSK_ICON_ASSET: Record<MskWeaponFamily, string> = {
  blunt_hammer_stormking: 'schematics/icon/SID_Blunt_Hammer_Stormking_SR_Ore_T05.webp',
  edged_sword_stormking: 'schematics/icon/SID_Edged_Sword_Stormking_SR_Ore_T05.webp',
  assault_stormking: 'schematics/icon/SID_Assault_Stormking_SR_Ore_T05.webp',
  explosive_stormking: 'schematics/icon/SID_Explosive_Stormking_SR_Ore_T05.webp',
  pistol_stormking: 'schematics/icon/SID_Pistol_Stormking_SR_Ore_T05.webp',
};

const MSK_WEAPON_ORDER: MskWeaponFamily[] = [
  'blunt_hammer_stormking',
  'edged_sword_stormking',
  'assault_stormking',
  'explosive_stormking',
  'pistol_stormking',
];

function resolveMskWeaponEmoji(family: MskWeaponFamily): string {
  const byName = e(MSK_EMOJI_NAME[family]);
  if (byName) return byName;
  return eAsset(MSK_ICON_ASSET[family]);
}

export function formatMskWeaponRow(
  client: Client,
  weapons: StwMskWeapons,
): string {
  const ownedMark = getEmoji(client, 'success');
  const missingMark = getEmoji(client, 'error');

  return MSK_WEAPON_ORDER
    .map((family) => {
      const icon = resolveMskWeaponEmoji(family);
      const mark = weapons[family] ? ownedMark : missingMark;
      return icon ? `${icon}${mark}` : mark;
    })
    .join(' ');
}
