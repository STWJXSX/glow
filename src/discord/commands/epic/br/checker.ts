/**
 * /checker    Full Fortnite account report
 * Gathers account info, stats, locker data and generates images + files.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { refreshAccountToken, getLauncherToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { log } from '#helpers/core/logger.ts';
import { getAppEmojiByName, getEmoji, getEmojiButtonComponent, EMOJI_IDS } from '#helpers/core/emojis.ts';
import { checkUserPremium } from '#helpers/core/client/premium.ts';
import { buildDiscordLocalizations, getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import {
  CHECKER_IMAGE_CHOICES,
  CHECKER_IMAGE_KEYS,
  CHECKER_IMAGE_PRESET_CHOICES,
  applyCheckerImagePreset,
  getCheckerImageConfig,
  mergeCheckerImageConfig,
  saveCheckerImageConfig,
  type CheckerImageConfig,
  type CheckerImageKey,
  type CheckerImagePreset,
} from '#helpers/epic/checker/checkerImageConfig.ts';
import { generateCheckerImages } from '#helpers/epic/checker/checkerImages.ts';
import {
  deriveFortniteSanctionFlags,
  fetchEosActiveSanctionActions,
  fetchFortniteLightswitchStatus,
} from '#helpers/epic/account/fortniteSanctions.ts';
import {
  buildCheckerReportEmbeds,
  buildCheckerReportIntroEmbed,
} from '#helpers/epic/checker/checkerReportEmbeds.ts';
import {
  INFO_PANEL_IDLE_MS,
  isCollectorIdle,
} from '#helpers/commands/discord/info/infoCollectorHelper.ts';
import {
  createEmbed,
  createErrorEmbed,
  createSuccessEmbed,
  createInfoEmbed,
  embedStyleFromTone,
  createLoadingGifAttachment,
  LOADING_THUMBNAIL,
  truncateEmbedText,
  DISCORD_EMBED_DESCRIPTION_SAFE,
  sendEmbedBatches,
  createDescriptionEmbed,
} from '#helpers/core/embedHelper.ts';
import { createAuthSession, clearAuthSession, getAuthSession } from '#helpers/epic/auth/authSessions.ts';
import { buildGatewayEmbed } from '#helpers/core/client/gatewayMessageHelper.ts';
import type { ExtendedClient } from '#structures/types.ts';
import {
  beginTemporaryEasyLogin,
  createTemporaryAccountFromAuthorizationCode,
  createTemporaryAccountFromDeviceAuth,
  createTemporaryAccountFromExchangeCode,
  pollTemporaryEasyLogin,
  refreshTemporaryCheckerAccount,
  type TemporaryCheckerAccount,
} from '#helpers/epic/checker/checkerTemporaryAuth.ts';

//  ”€ ”€ ”€ Helpers  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) +
    ' @ ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) +
    ' UTC'
  );
}

function daysAgo(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) + ' days ago';
}

const yesNo = (v: any): string => (v ? 'Yes' : 'No');
const numFmt = (n: any): string => (Number(n) || 0).toLocaleString('en-US');

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const RARITY_ICON: Record<string, string> = {
  Common: '[C]', Uncommon: '[UC]', Rare: '[R]', Epic: '[VR]', Legendary: '[SR]', Mythic: '[M]',
};

function rarityTable(counter: Record<string, number>): string {
  const rows: string[] = ['| Rarity | Count |', '|--------|-------|'];
  for (const r of RARITY_ORDER) {
    if (counter[r]) rows.push(`| ${RARITY_ICON[r]} ${r} | **${counter[r]}** |`);
  }
  return rows.join('\n');
}

function countLocker(items: Record<string, any>): Record<string, number> {
  const c: Record<string, number> = {
    Skins: 0, 'Back Blings': 0, Pickaxes: 0, Emotes: 0, Gliders: 0, Wraps: 0,
    'Loading Screens': 0, 'Music Packs': 0, Shoes: 0, Vehicles: 0,
    Contrails: 0, Sprays: 0, Emoticons: 0,
  };
  for (const item of Object.values(items)) {
    const [prefix, cid] = [
      item.templateId.split(':')[0],
      (item.templateId.split(':')[1] || '').toLowerCase(),
    ];
    if (prefix === 'AthenaCharacter') c['Skins']++;
    else if (prefix === 'AthenaBackpack') c['Back Blings']++;
    else if (prefix === 'AthenaPickaxe') c['Pickaxes']++;
    else if (prefix === 'AthenaGlider') c['Gliders']++;
    else if (prefix === 'AthenaItemWrap') c['Wraps']++;
    else if (prefix === 'AthenaLoadingScreen') c['Loading Screens']++;
    else if (prefix === 'AthenaMusicPack') c['Music Packs']++;
    else if (prefix === 'CosmeticShoes') c['Shoes']++;
    else if (prefix === 'VehicleCosmetics_Body') c['Vehicles']++;
    else if (prefix === 'AthenaSkyDiveContrail') c['Contrails']++;
    else if (prefix === 'AthenaDance') {
      if (cid.startsWith('eid_') || cid.startsWith('dance_') || cid.startsWith('toy_')) c['Emotes']++;
      else if (cid.startsWith('spray_') || cid.startsWith('spid_')) c['Sprays']++;
      else if (cid.startsWith('emoji_') || cid.startsWith('emoticon_')) c['Emoticons']++;
      else c['Emotes']++;
    }
  }
  return c;
}

function getSchematicTier(templateId: string, level: number): number {
  const m = templateId.match(/_t0(\d)/);
  if (m) {
    const t = parseInt(m[1], 10);
    if (t >= 1 && t <= 6) return t;
  }
  if (level <= 10) return 1;
  if (level <= 20) return 2;
  if (level <= 30) return 3;
  if (level <= 40) return 4;
  if (level <= 50) return 5;
  return 6;
}

function getSchematicType(templateId: string): string {
  const t = templateId.toLowerCase();
  const traps = ['trap', 'wall_', 'floor_', 'ceiling_', 'launch', 'campfire', 'healing', 'teleporter', 'placeable'];
  const weapons = ['pistol', 'shotgun', 'rifle', 'sniper', 'smg', 'lmg', 'assault', 'minigun', 'launcher',
    'bow', 'crossbow', 'explosive', 'melee', 'sword', 'axe', 'scythe', 'hammer', 'club',
    'spear', 'edged', 'blunt', 'knife', 'bat', 'wrench', 'deathray', 'typewriter',
    'plasmagun', 'raygun', 'flintlock', 'gravedigger', 'neon', 'nocturno',
    'endgame', 'vacuum', 'obliterator', 'rocket', 'grenade'];
  if (traps.some(x => t.includes(x))) return 'Trap';
  if (weapons.some(x => t.includes(x))) return 'Weapon';
  return 'Other';
}

function getHeroClass(templateId: string): string {
  const t = templateId.toLowerCase();
  if (t.includes('soldier') || t.includes('commando')) return 'Soldier';
  if (t.includes('ninja')) return 'Ninja';
  if (t.includes('outlander')) return 'Outlander';
  if (t.includes('constructor')) return 'Constructor';
  return 'Other';
}

//  ”€ ”€ ”€ Markdown Builder  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

function buildMarkdown(d: any): string {
  const L: string[] = [];
  const h1 = (t: string) => L.push(`# ${t}`);
  const h2 = (t: string) => L.push(`\n## ${t}`);
  const h3 = (t: string) => L.push(`\n### ${t}`);
  const row = (k: string, v: any) => L.push(`- **${k}:** ${v}`);
  const sep = () => L.push('\n---');
  const br = () => L.push('');

  h1('Fortnite Account Report');
  L.push(`*Generated: ${fmtDate(new Date().toISOString())}*`);
  sep();

  // Account Info
  h2('Account Information');
  row('Account ID', `\`${d.accountId}\``);
  row('Email', d.email || '  ');
  row('Email Verified', yesNo(d.emailVerified));
  row('Display Name', d.displayName || '  ');
  row('Full Name', d.fullName || '  ');
  row('2FA Enabled', yesNo(d.twoFactor));
  row('Last Login', fmtDate(d.lastLogin));
  row('Can Update Display Name', yesNo(d.canUpdateDisplayName));
  row('Total Name Changes', d.numberOfDisplayNameChanges ?? 'N/A');
  sep();

  // Ban Info
  h2('Ban & Restriction Info');
  row('Never Sanctioned', yesNo(!d.activeSanctions));
  row('FN Entitlement access', yesNo(!d.fnEntitlementBan));
  row('Epic Social access', yesNo(!d.epicSocialBan));
  row('FN Matchmaking access', yesNo(!d.fnMatchmakingBan));
  sep();

  // Stats
  const a = d.athenaStats;
  h2('Account Statistics');
  row('Account Level', `**${numFmt(a.accountLevel)}**`);
  row('2FA Reward Claimed', yesNo(a.mfa_reward_claimed));
  row('Lifetime Wins (BR)', `**${numFmt(a.lifetime_wins)}**`);
  row('Total Matches (BR)', d.totalMatchesBR != null ? `**${numFmt(d.totalMatchesBR)}**` : 'Unavailable');
  row('Last BR Match', `${fmtDate(a.last_match_end_datetime)} (${daysAgo(a.last_match_end_datetime)})`);
  row('Last STW Match', `${fmtDate(a.last_stw_match_end_datetime)} (${daysAgo(a.last_stw_match_end_datetime)})`);
  br();
  row('Season XP', numFmt(a.xp));
  row('Cumulative XP', numFmt(a.rested_xp_consumed_cumulative));
  row('Rested XP', numFmt(a.rested_xp));
  row('Rested XP Multiplier', `x${a.rested_xp_mult ?? '  '}`);
  sep();

  // Current Season
  h2('Current Season');
  row('Season Number', a.season_num ?? 'N/A');
  row('Season Level', a.level ?? 0);
  row('Battle Pass Level', a.book_level ?? 0);
  row('Battle Pass XP (of this level)', numFmt(a.book_xp));
  sep();

  // Past Seasons
  h2('Past Seasons');
  br();
  L.push('| Season | Level | BP Level | Wins | BP Purchased |');
  L.push('|--------|-------|----------|------|--------------|');
  for (const s of [...(a.past_seasons || [])].sort((x: any, y: any) => x.seasonNumber - y.seasonNumber)) {
    L.push(`| ${s.seasonNumber} | ${s.seasonLevel ?? 0} | ${s.bookLevel ?? 0} | ${s.numWins ?? 0} | ${yesNo(s.purchasedVIP)} |`);
  }
  sep();

  // V-Bucks
  h2('V-Bucks & Purchases');
  br();
  const cc = d.commonStats;
  const mtxH = cc.mtx_purchase_history || {};
  const purch: any[] = mtxH.purchases || [];
  const vbSpent = purch.reduce((s: number, p: any) => s + (p.totalMtxPaid || 0), 0);
  const refUsed = mtxH.refundsUsed || 0;
  const giftH = cc.gift_history || {};

  row('V-Bucks Available', `**${numFmt(d.vbucksAvailable)} VB**`);
  row('V-Bucks Spent (log)', `**${numFmt(vbSpent)} VB**`);
  row('Refund Credits', `**${Math.max(0, 3 - refUsed)}** / 3 (used: ${refUsed})`);
  row('Return Tickets Active', `**${(cc.undo_cooldowns || []).length}**`);
  row('Creator Code', `\`${cc.mtx_affiliate || 'None'}\``);
  row('Purchase Platform', cc.current_mtx_platform || '  ');
  row('Can Send Gifts', yesNo(cc.allowed_to_send_gifts));
  row('Gifts Sent', numFmt(giftH.num_sent));
  row('Gifts Received', numFmt(giftH.num_received));
  br();

  h3('Last 10 Purchases');
  L.push('| Date | Item | VB | Status |');
  L.push('|------|------|----|--------|');
  for (const p of [...purch].sort((a: any, b: any) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()).slice(0, 10)) {
    const itm = p.lootResult?.[0]?.itemType?.split(':')[1] ?? 'Unknown';
    const est = p.refundDate ? 'Refunded' : '  ';
    L.push(`| ${fmtDate(p.purchaseDate)} | \`${itm}\` | ${numFmt(p.totalMtxPaid)} | ${est} |`);
  }
  sep();

  // Locker Stats
  h2('Locker Stats');
  br();
  const locker = d.locker;
  const lockerTotal = Object.values(locker).reduce((s: number, v: any) => s + v, 0);
  row('Total Locker Items', `**${numFmt(lockerTotal)}**`);
  br();
  L.push('| Category | Count |');
  L.push('|----------|-------|');
  for (const [cat, count] of Object.entries(locker)) {
    L.push(`| ${cat} | **${count}** |`);
  }
  sep();

  // Connected Accounts
  h2('Connected Accounts');
  br();
  if (!d.externalAuths?.length) {
    L.push('*No external accounts connected.*');
  } else {
    L.push('| Platform | Name |');
    L.push('|----------|------|');
    for (const auth of d.externalAuths) {
      L.push(`| ${auth.type || auth.externalAuthType || '  '} | ${auth.externalDisplayName || auth.externalAuthId || '  '} |`);
    }
  }
  sep();

  // Save the World
  const cs = d.campaignStats;
  const ci = d.campaignItems;

  h2('Save the World');
  br();
  row('STW Level', `**${cs.level ?? 0}**`);
  row('STW XP', numFmt(cs.xp));
  row('Matches Played (STW)', `**${numFmt(cs.matches_played)}**`);
  row('Zones Completed', numFmt(d.stw_zones_completed));
  row('MFA Reward', yesNo(cs.mfa_reward_claimed));
  row('Collection Book Level', numFmt(cs.collection_book?.maxBookXpLevelAchieved));
  row('Research Points Spent', numFmt(cs.legacy_research_points_spent));
  row('Total Login Days (STW)', numFmt(cs.daily_rewards?.totalDaysLoggedIn));
  br();

  h3('Research Levels');
  L.push('| Stat | Level |');
  L.push('|------|-------|');
  for (const [k, v] of Object.entries(cs.research_levels || {})) {
    L.push(`| ${k.charAt(0).toUpperCase() + k.slice(1)} | **${v}** |`);
  }
  br();

  // Heroes
  h3('Heroes');
  const heroItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Hero:'));
  const heroRarities: Record<string, number> = {};
  const heroClasses: Record<string, number> = {};
  for (const h of heroItems as any[]) {
    const r = h.attributes?.starting_rarity || 'Unknown';
    const c = getHeroClass(h.templateId);
    heroRarities[r] = (heroRarities[r] || 0) + 1;
    heroClasses[c] = (heroClasses[c] || 0) + 1;
  }
  row('Total Heroes', `**${heroItems.length}**`);
  br();
  L.push('**By Class:**');
  br();
  L.push('| Class | Count |');
  L.push('|-------|-------|');
  for (const [cls, cnt] of Object.entries(heroClasses)) L.push(`| ${cls} | **${cnt}** |`);
  br();
  L.push('**By Rarity:**');
  br();
  L.push(rarityTable(heroRarities));
  br();

  // Survivors
  h3('Survivors');
  const workerItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Worker:'));
  const workerRar: Record<string, number> = {};
  let leadsCount = 0;
  let basicCount = 0;
  for (const w of workerItems as any[]) {
    const r = w.attributes?.starting_rarity || 'Unknown';
    workerRar[r] = (workerRar[r] || 0) + 1;
    if (w.templateId.toLowerCase().includes('manager')) leadsCount++;
    else basicCount++;
  }
  row('Total Survivors', `**${workerItems.length}**`);
  row('Lead Survivors', `**${leadsCount}**`);
  row('Basic Survivors', `**${basicCount}**`);
  br();
  L.push('**By Rarity:**');
  br();
  L.push(rarityTable(workerRar));
  br();

  // Defenders
  h3('Defenders');
  const defItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Defender:'));
  const defRar: Record<string, number> = {};
  for (const def of defItems as any[]) {
    const r = def.attributes?.starting_rarity || 'Unknown';
    defRar[r] = (defRar[r] || 0) + 1;
  }
  row('Total Defenders', `**${defItems.length}**`);
  br();
  L.push('**By Rarity:**');
  br();
  L.push(rarityTable(defRar));
  br();

  // Schematics
  h3('Schematics');
  const schItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Schematic:'));
  const schRar: Record<string, number> = {};
  const schTiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const schTypes: Record<string, number> = { Weapon: 0, Trap: 0, Other: 0 };
  const schTierRar: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {} };

  for (const s of schItems as any[]) {
    const r = s.attributes?.starting_rarity || 'Unknown';
    const lvl = s.attributes?.level || 1;
    const tier = getSchematicTier(s.templateId, lvl);
    const type = getSchematicType(s.templateId);
    schRar[r] = (schRar[r] || 0) + 1;
    schTiers[tier] = (schTiers[tier] || 0) + 1;
    schTypes[type] = (schTypes[type] || 0) + 1;
    schTierRar[tier][r] = (schTierRar[tier][r] || 0) + 1;
  }

  row('Total Schematics', `**${schItems.length}**`);
  row('Weapons', `**${schTypes.Weapon}**`);
  row('Traps', `**${schTypes.Trap}**`);
  row('Other', `**${schTypes.Other}**`);
  br();
  L.push('**By Tier:**');
  br();
  L.push('| Tier | Level Range | STW PL | Count | Rarities |');
  L.push('|------|-------------|--------|-------|----------|');
  const tierMeta: [number, string, string][] = [
    [1, '1-10', '<=26'], [2, '11-20', '<=52'], [3, '21-30', '<=77'],
    [4, '31-40', '<=106'], [5, '41-50', '<=130'], [6, '51-60', '>130'],
  ];
  for (const [t, range, pl] of tierMeta) {
    const cnt = schTiers[t];
    const rarParts = RARITY_ORDER
      .filter(r => schTierRar[t][r])
      .map(r => `${RARITY_ICON[r]}x${schTierRar[t][r]}`);
    L.push(`| **Tier ${t}** | ${range} | ${pl} | **${cnt}** | ${rarParts.join(' ') || '  '} |`);
  }
  br();
  L.push('**By Rarity (all):**');
  br();
  L.push(rarityTable(schRar));
  sep();

  L.push(`\n*Report auto-generated    Account \`${d.accountId}\`*`);
  return L.join('\n');
}

//  ”€ ”€ ”€ Transactions JSON builder  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

function buildTransactionsJson(cc: any, accountId: string): string {
  const purchases: any[] = cc.mtx_purchase_history?.purchases ?? [];
  const sorted = [...purchases].sort(
    (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime(),
  );
  const rows = sorted.map(p => ({
    date: p.purchaseDate ?? null,
    item: p.lootResult?.[0]?.itemType ?? 'Unknown',
    vbCost: p.totalMtxPaid ?? 0,
    refunded: !!p.refundDate,
    refundDate: p.refundDate ?? null,
    offerId: p.offerId ?? null,
  }));
  return JSON.stringify({ accountId, totalPurchases: rows.length, purchases: rows }, null, 2);
}

//  ”€ ”€ ”€ Section splitter  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

const SECTIONS = [
  '## Account Information',
  '## Ban & Restriction Info',
  '## Account Statistics',
  '## Current Season',
  '## Past Seasons',
  '## V-Bucks & Purchases',
  '## Locker Stats',
  '## Connected Accounts',
  '## Save the World',
] as const;

function splitMarkdownIntoSections(md: string): { title: string; content: string }[] {
  const result: { title: string; content: string }[] = [];
  const lines = md.split('\n');

  let currentTitle = 'Fortnite Account Report';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentLines.length > 0) {
        result.push({ title: currentTitle, content: currentLines.join('\n').trim() });
      }
      currentTitle = line.replace(/^## /, '');
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    result.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  }
  return result;
}

//  ”€ ”€ ”€ Cosmetics Cache (autocomplete)  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

let _cosmeticsCache: { data: any[]; ts: number } | null = null;
const _COSMETICS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchCosmeticsForAutocomplete(): Promise<any[]> {
  if (_cosmeticsCache && Date.now() - _cosmeticsCache.ts < _COSMETICS_CACHE_TTL) {
    return _cosmeticsCache.data;
  }
  try {
    const res = await axios.get('https://fortnite-api.com/v2/cosmetics/br?language=en', { timeout: 15_000 });
    const items: any[] = res.data?.data ?? [];
    _cosmeticsCache = { data: items, ts: Date.now() };
    return items;
  } catch {
    return _cosmeticsCache?.data ?? [];
  }
}

//  ”€ ”€ ”€ Command  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('checker')
    .setDescription('Fortnite account tools')
    .setNameLocalizations(buildDiscordLocalizations('checker.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.description'))
    .addSubcommand(sub =>
      sub
        .setName('run')
        .setDescription('Open the checker control panel')
        .setNameLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.run.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.run.description')),
    )
    .addSubcommand(sub =>
      sub
        .setName('configure')
        .setDescription('Configure which checker images are sent')
        .setNameLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.configure.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.configure.description'))
        .addStringOption(opt =>
          opt
            .setName('preset')
            .setDescription('Apply a preset to all image toggles')
            .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.configure.options.preset.description'))
            .setRequired(false)
            .addChoices(...CHECKER_IMAGE_PRESET_CHOICES),
        )
        .addStringOption(opt =>
          opt
            .setName('image')
            .setDescription('Image type to enable or disable')
            .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.configure.options.image.description'))
            .setRequired(false)
            .addChoices(...CHECKER_IMAGE_CHOICES),
        )
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('Turn the selected image type on or off')
            .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.subcommands.configure.options.enabled.description'))
            .setRequired(false),
        ),
    )
    .addSubcommandGroup(group =>
      group
        .setName('add')
        .setNameLocalizations(buildDiscordLocalizations('checker.cmd.groups.add.name'))
        .setDescription('Submit suggestions to the developer')
        .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.groups.add.description'))
        .addSubcommand(sub =>
          sub
            .setName('exclusive')
            .setNameLocalizations(buildDiscordLocalizations('checker.cmd.groups.add.subcommands.exclusive.name'))
            .setDescription('Suggest a cosmetic to be added to the exclusives list')
            .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.groups.add.subcommands.exclusive.description'))
            .addStringOption(opt =>
              opt
                .setName('cosmetic')
                .setNameLocalizations(buildDiscordLocalizations('checker.cmd.groups.add.subcommands.exclusive.options.cosmetic.name'))
                .setDescription('Cosmetic name or ID')
                .setDescriptionLocalizations(buildDiscordLocalizations('checker.cmd.groups.add.subcommands.exclusive.options.cosmetic.description'))
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    ) as unknown as SlashCommandBuilder,

  auth: true,
  cooldown: 60,
  nodefer: true,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const items = await fetchCosmeticsForAutocomplete();
      const matches = items
        .filter(c => c.name?.toLowerCase().includes(focused) || c.id?.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(c => ({
          name: `${c.name} [${c.type?.displayValue ?? c.type?.value ?? 'Unknown'}]`.slice(0, 100),
          value: c.id as string,
        }));
      await interaction.respond(matches);
    } catch {
      try { await interaction.respond([]); } catch { /* ignore */ }
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subgroup = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (sub === 'run') {
      await handleCheckerRun(interaction);
    } else if (sub === 'configure') {
      await handleCheckerConfigure(interaction);
    } else if (subgroup === 'add' && sub === 'exclusive') {
      await handleCheckerAddExclusive(interaction);
    }
  },
};

//  ”€ ”€ ”€ Subcommand Handlers  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€

interface RunReportParams {
  accessToken: string;
  accountId: string;
  displayName: string;
  userId: string;
  client: any;
  dmChannel: any;
  customInviteLink?: string;
  customFooterImageUrl?: string;
  imageConfig: CheckerImageConfig;
  lang: SupportedLanguage;
}

type CheckerStatusTone = 'neutral' | 'success' | 'warning' | 'error';

interface CheckerPanelState {
  savedMainAccount: {
    accountId: string;
    displayName: string;
    deviceId?: string;
    secret?: string;
  };
  tempAccount: TemporaryCheckerAccount | null;
  customInviteLink?: string;
  customFooterImageUrl?: string;
  view: 'main' | 'login';
  confirmAction: 'remove_current' | 'remove_bulk' | null;
  statusMessage?: string;
  statusTone: CheckerStatusTone;
  busy: boolean;
  easyLogin?: {
    verificationUrl: string;
    deviceCode: string;
    cancelled: boolean;
  };
}

interface ResolvedCheckerAccount {
  accountId: string;
  displayName: string;
  accessToken: string;
  isTemporary: boolean;
}

const CHECKER_PANEL_TIMEOUT = INFO_PANEL_IDLE_MS;
const PREMIUM_BTN_EMOJI = { id: EMOJI_IDS.premium, name: 'premium' };

function formatPanelQuote(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed.trim()) return trimmed;
      if (trimmed.startsWith('>')) return trimmed;
      return `> ${trimmed}`;
    })
    .join('\n');
}

async function translateCheckerPanel(
  userId: string,
  key: string,
  interaction: ChatInputCommandInteraction,
  replacements?: Record<string, string | number>,
): Promise<string> {
  const premiumEmoji = getEmoji(interaction.client, 'premium');
  return translateForUser(
    userId,
    key,
    { premiumEmoji, ...replacements },
    interaction.locale,
  );
}

function cleanInlineValue(value: string, maxLength = 300): string {
  return value.replace(/`/g, '').trim().slice(0, maxLength);
}

async function setCheckerPanelStatus(
  userId: string,
  state: CheckerPanelState,
  tone: CheckerStatusTone,
  key: string,
  replacements?: Record<string, string | number>,
): Promise<void> {
  state.statusTone = tone;
  state.statusMessage = await translateForUser(userId, key, replacements);
}

async function getCheckerExchangeCode(accessToken: string): Promise<string | null> {
  try {
    const response = await axios.get(Endpoints.OAUTH_EXCHANGE, {
      headers: { Authorization: `bearer ${accessToken}` },
      timeout: 10000,
    });

    return response.data?.code ?? null;
  } catch {
    return null;
  }
}

async function getCheckerDmChannel(interaction: ChatInputCommandInteraction): Promise<any | null> {
  try {
    return await interaction.user.createDM();
  } catch {
    return null;
  }
}

async function resolveCurrentCheckerAccount(
  userId: string,
  state: CheckerPanelState,
): Promise<ResolvedCheckerAccount> {
  if (state.tempAccount) {
    const refreshedAccount = await refreshTemporaryCheckerAccount(state.tempAccount);
    state.tempAccount = refreshedAccount;

    return {
      accountId: refreshedAccount.accountId,
      displayName: refreshedAccount.displayName,
      accessToken: refreshedAccount.accessToken,
      isTemporary: true,
    };
  }

  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo?.deviceAuths?.length) {
    throw new Error('NO_SAVED_ACCOUNT');
  }

  const savedMain = userInfo.deviceAuths.find((account: any) => account.accountId === state.savedMainAccount.accountId)
    ?? userInfo.deviceAuths.find((account: any) => account.cuentaMain);

  if (!savedMain) {
    throw new Error('NO_MAIN_ACCOUNT');
  }

  const { account, error } = await refreshAccountToken(userInfo, savedMain.accountId);
  if (!account || error) {
    throw new Error('TOKEN_FAILED');
  }

  state.savedMainAccount = {
    accountId: savedMain.accountId,
    displayName: account.displayName || savedMain.displayName,
    deviceId: savedMain.deviceId,
    secret: savedMain.secret,
  };

  return {
    accountId: account.accountId,
    displayName: account.displayName,
    accessToken: account.accessToken,
    isTemporary: false,
  };
}

async function handleCheckerBulk(
  interaction: ChatInputCommandInteraction,
  customization: { customInviteLink?: string; customFooterImageUrl?: string },
  onProgress?: (message: string) => Promise<void>,
): Promise<{ total: number; succeeded: number; failed: number }> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo?.deviceAuths?.length) {
    throw new Error('NO_SAVED_ACCOUNT');
  }

  const dmChannel = await getCheckerDmChannel(interaction);
  if (!dmChannel) {
    throw new Error('DM_DISABLED');
  }

  const [imageConfig, lang] = await Promise.all([
    getCheckerImageConfig(userId),
    getUserLanguage(userId, interaction.locale ?? interaction.guildLocale),
  ]);

  const total = userInfo.deviceAuths.length;
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < userInfo.deviceAuths.length; index++) {
    const accountDoc = userInfo.deviceAuths[index] as any;
    if (onProgress) {
      await onProgress(
        await translateForUser(userId, 'checker.panel.messages.bulkProgress', {
          current: index + 1,
          total,
          name: cleanInlineValue(accountDoc.displayName || accountDoc.accountId, 40),
        }),
      );
    }

    try {
      const { account, error } = await refreshAccountToken(userInfo, accountDoc.accountId);
      if (!account || error) {
        failed++;
        continue;
      }

      const result = await runAccountReport({
        accessToken: account.accessToken,
        accountId: account.accountId,
        displayName: account.displayName,
        userId,
        client,
        dmChannel,
        customInviteLink: customization.customInviteLink,
        customFooterImageUrl: customization.customFooterImageUrl,
        imageConfig,
        lang,
      });

      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { total, succeeded, failed };
}

async function removeAllFriendsForAccount(accountId: string, accessToken: string): Promise<void> {
  await axios.delete(`${Endpoints.FRIENDS}/${accountId}/friends`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
}

async function buildLaunchCommandForAccount(account: ResolvedCheckerAccount): Promise<string | null> {
  const launcherToken = await getLauncherToken(account.accessToken);
  if (!launcherToken) {
    return null;
  }

  const finalExchangeCode = await getCheckerExchangeCode(launcherToken);
  if (!finalExchangeCode) {
    return null;
  }

  return `start /d "C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64" FortniteLauncher.exe -AUTH_LOGIN=unused -AUTH_PASSWORD=${finalExchangeCode} -AUTH_TYPE=exchangecode -epicapp=Fortnite -epicenv=Prod -EpicPortal -epicuserid=${account.accountId}`;
}

async function showCustomizeModal(
  component: ButtonInteraction,
  userId: string,
  currentLink?: string,
  currentFooterIcon?: string,
): Promise<ModalSubmitInteraction | null> {
  const modal = new ModalBuilder()
    .setCustomId('checker_panel_customize_modal')
    .setTitle(await translateForUser(userId, 'checker.panel.modals.customize.title'))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('invite_link')
          .setLabel(await translateForUser(userId, 'checker.panel.modals.customize.label'))
          .setPlaceholder(await translateForUser(userId, 'checker.panel.modals.customize.placeholder'))
          .setRequired(false)
          .setStyle(TextInputStyle.Short)
          .setValue(currentLink ?? ''),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('footer_icon_url')
          .setLabel(await translateForUser(userId, 'checker.panel.modals.customize.footerIconLabel'))
          .setPlaceholder(await translateForUser(userId, 'checker.panel.modals.customize.footerIconPlaceholder'))
          .setRequired(false)
          .setStyle(TextInputStyle.Short)
          .setValue(currentFooterIcon ?? ''),
      ),
    );

  await component.showModal(modal);

  try {
    return await component.awaitModalSubmit({
      filter: (modalInteraction) => modalInteraction.user.id === component.user.id
        && modalInteraction.customId === 'checker_panel_customize_modal',
      time: 120000,
    });
  } catch {
    return null;
  }
}

async function showSingleTextModal(
  component: ButtonInteraction,
  modalId: string,
  title: string,
  label: string,
  placeholder: string,
  options?: { required?: boolean; value?: string },
): Promise<ModalSubmitInteraction | null> {
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setPlaceholder(placeholder)
          .setRequired(options?.required ?? true)
          .setStyle(TextInputStyle.Short)
          .setValue(options?.value ?? ''),
      ),
    );

  await component.showModal(modal);

  try {
    return await component.awaitModalSubmit({
      filter: modalInteraction => modalInteraction.user.id === component.user.id && modalInteraction.customId === modalId,
      time: 120000,
    });
  } catch {
    return null;
  }
}

async function showDeviceAuthModal(
  component: ButtonInteraction,
  userId: string,
): Promise<ModalSubmitInteraction | null> {
  const modal = new ModalBuilder()
    .setCustomId('checker_panel_device_auth_modal')
    .setTitle(await translateForUser(userId, 'checker.panel.modals.deviceAuth.title'))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('account_id')
          .setLabel(await translateForUser(userId, 'checker.panel.modals.deviceAuth.accountIdLabel'))
          .setPlaceholder(await translateForUser(userId, 'checker.panel.modals.deviceAuth.accountIdPlaceholder'))
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('device_id')
          .setLabel(await translateForUser(userId, 'checker.panel.modals.deviceAuth.deviceIdLabel'))
          .setPlaceholder(await translateForUser(userId, 'checker.panel.modals.deviceAuth.deviceIdPlaceholder'))
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('secret')
          .setLabel(await translateForUser(userId, 'checker.panel.modals.deviceAuth.secretLabel'))
          .setPlaceholder(await translateForUser(userId, 'checker.panel.modals.deviceAuth.secretPlaceholder'))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );

  await component.showModal(modal);

  try {
    return await component.awaitModalSubmit({
      filter: modalInteraction => modalInteraction.user.id === component.user.id && modalInteraction.customId === 'checker_panel_device_auth_modal',
      time: 120000,
    });
  } catch {
    return null;
  }
}

async function buildCheckerPanelReply(
  interaction: ChatInputCommandInteraction,
  state: CheckerPanelState,
  options?: { disabled?: boolean },
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}> {
  const userId = interaction.user.id;
  const activeAccount = state.tempAccount ?? state.savedMainAccount;
  const isTemporary = !!state.tempAccount;
  const loginMethod = state.tempAccount
    ? await translateCheckerPanel(userId, `checker.panel.loginMethods.${state.tempAccount.loginMethod}`, interaction)
    : null;

  const accountMode = isTemporary
    ? await translateCheckerPanel(userId, 'checker.panel.values.temporary', interaction, {
        method: loginMethod || 'Temporary',
      })
    : await translateCheckerPanel(userId, 'checker.panel.values.savedMain', interaction);

  const customizationLines: string[] = [];
  if (state.customInviteLink) {
    customizationLines.push(`**Link:** \`${cleanInlineValue(state.customInviteLink, 120)}\``);
  }
  if (state.customFooterImageUrl) {
    customizationLines.push(`**Footer icon:** \`${cleanInlineValue(state.customFooterImageUrl, 120)}\``);
  }
  const customizationRaw = customizationLines.length
    ? customizationLines.join('\n')
    : await translateCheckerPanel(userId, 'checker.panel.values.notSet', interaction);

  let actionsValue = await translateCheckerPanel(userId, 'checker.panel.actions.main', interaction);
  if (state.view === 'login') {
    actionsValue = await translateCheckerPanel(userId, 'checker.panel.actions.login', interaction);
  }
  if (state.confirmAction === 'remove_current') {
    actionsValue = await translateCheckerPanel(userId, 'checker.panel.actions.confirmCurrent', interaction);
  }
  if (state.confirmAction === 'remove_bulk') {
    actionsValue = await translateCheckerPanel(userId, 'checker.panel.actions.confirmBulk', interaction);
  }
  if (state.easyLogin) {
    actionsValue = await translateCheckerPanel(userId, 'checker.panel.actions.easyLogin', interaction);
  }

  const accountValue = formatPanelQuote(
    [
      `**${cleanInlineValue(activeAccount.displayName || activeAccount.accountId, 60)}**`,
      accountMode,
      `\`${cleanInlineValue(activeAccount.accountId, 64)}\``,
    ].join('\n'),
  );

  const statusRaw =
    state.statusMessage ??
    (await translateCheckerPanel(userId, 'checker.panel.messages.opened', interaction));

  const embed = await createEmbed({
    style: embedStyleFromTone(state.statusTone),
    title: await translateCheckerPanel(userId, 'checker.panel.title', interaction),
    description: await translateCheckerPanel(
      userId,
      state.view === 'login' ? 'checker.panel.descriptionLogin' : 'checker.panel.description',
      interaction,
    ),
    thumbnail: state.busy ? LOADING_THUMBNAIL : undefined,
    fields: [
      {
        name: await translateCheckerPanel(userId, 'checker.panel.fields.account', interaction),
        value: accountValue.slice(0, 1024),
      },
      {
        name: await translateCheckerPanel(userId, 'checker.panel.fields.customization', interaction),
        value: formatPanelQuote(customizationRaw).slice(0, 1024),
      },
      {
        name: await translateCheckerPanel(userId, 'checker.panel.fields.actions', interaction),
        value: actionsValue.slice(0, 1024),
      },
      {
        name: await translateCheckerPanel(userId, 'checker.panel.fields.status', interaction),
        value: formatPanelQuote(statusRaw).slice(0, 1024),
      },
    ],
    footer: { text: await translateCheckerPanel(userId, 'checker.panel.footer', interaction) },
    interaction,
  });

  if (!state.busy) {
    embed.setThumbnail(null);
  }

  const panelFiles = state.busy ? [createLoadingGifAttachment()] : [];

  const finishPanelReply = (components: ActionRowBuilder<ButtonBuilder>[]) => ({
    embeds: [embed],
    components,
    files: panelFiles,
  });

  const disabled = options?.disabled ?? false;
  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (state.confirmAction) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('checker_panel_confirm')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.confirm'))
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled || state.busy),
        new ButtonBuilder()
          .setCustomId('checker_panel_cancel')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.cancel'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || state.busy),
      ),
    );

    return finishPanelReply(components);
  }

  if (state.easyLogin) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.openEpicLogin'))
          .setURL(state.easyLogin.verificationUrl),
        new ButtonBuilder()
          .setCustomId('checker_panel_cancel_easy_login')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.cancel'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    );

    return finishPanelReply(components);
  }

  if (state.view === 'login') {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('checker_panel_login_easy')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.easyLogin'))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled || state.busy),
        new ButtonBuilder()
          .setCustomId('checker_panel_login_auth')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.authCode'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || state.busy),
        new ButtonBuilder()
          .setCustomId('checker_panel_login_exchange')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.exchangeCode'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || state.busy),
        new ButtonBuilder()
          .setCustomId('checker_panel_login_device_auth')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.deviceAuth'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || state.busy),
        new ButtonBuilder()
          .setCustomId('checker_panel_back')
          .setLabel(await translateForUser(userId, 'checker.panel.buttons.back'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || state.busy),
      ),
    );

    return finishPanelReply(components);
  }

  const bulkBtn = new ButtonBuilder()
    .setCustomId('checker_panel_bulk')
    .setLabel(await translateCheckerPanel(userId, 'checker.panel.buttons.runBulk', interaction))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || state.busy);
  const bulkEmoji = getEmojiButtonComponent('premium');
  if (bulkEmoji) bulkBtn.setEmoji(bulkEmoji);

  const customizeBtn = new ButtonBuilder()
    .setCustomId('checker_panel_customize')
    .setLabel(await translateCheckerPanel(userId, 'checker.panel.buttons.customize', interaction))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || state.busy);
  const customizeEmoji = getEmojiButtonComponent('premium');
  if (customizeEmoji) customizeBtn.setEmoji(customizeEmoji);

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('checker_panel_run')
        .setLabel(await translateForUser(userId, 'checker.panel.buttons.run'))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || state.busy),
      bulkBtn,
      customizeBtn,
      new ButtonBuilder()
        .setCustomId('checker_panel_launch')
        .setLabel(await translateForUser(userId, 'checker.panel.buttons.launch'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || state.busy),
      new ButtonBuilder()
        .setCustomId('checker_panel_login_toggle')
        .setLabel(await translateForUser(userId, state.tempAccount ? 'checker.panel.buttons.useMain' : 'checker.panel.buttons.login'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || state.busy),
    ),
  );

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('checker_panel_remove_current')
        .setLabel(await translateForUser(userId, 'checker.panel.buttons.removeFriends'))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled || state.busy),
      new ButtonBuilder()
        .setCustomId('checker_panel_remove_bulk')
        .setLabel(await translateForUser(userId, 'checker.panel.buttons.removeFriendsBulk'))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled || state.busy),
    ),
  );

  return finishPanelReply(components);
}

async function runAccountReport(params: RunReportParams): Promise<{ success: boolean; error?: string }> {
  const {
    accessToken,
    accountId,
    displayName,
    userId,
    client,
    dmChannel,
    imageConfig,
    lang,
    customInviteLink,
    customFooterImageUrl,
  } = params;
  const tmpDir = os.tmpdir();
  try {
    //  ”€ ”€ Fetch all data in parallel  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
    const [athenaData, commonData, campaignData, accountInfo, externalAuths, theaterData, outpostData, lightswitchStatus, eosSanctionActions] = await Promise.all([
      composeMCP({ profile: 'athena',      operation: 'QueryProfile', accountId, accessToken }),
      composeMCP({ profile: 'common_core', operation: 'QueryProfile', accountId, accessToken }),
      composeMCP({ profile: 'campaign',    operation: 'QueryProfile', accountId, accessToken }),
      axios.get(
        `${Endpoints.ACCOUNT_PUBLIC}/${accountId}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
      ).then(r => r.data),
      axios.get(
        `${Endpoints.ACCOUNT_PUBLIC}/${accountId}/externalAuths`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
      ).then(r => r.data).catch(() => []),
      composeMCP({ profile: 'theater0', operation: 'QueryProfile', accountId, accessToken }).catch(() => null),
      composeMCP({ profile: 'outpost0', operation: 'QueryProfile', accountId, accessToken }).catch(() => null),
      fetchFortniteLightswitchStatus(accessToken).catch(() => null),
      fetchEosActiveSanctionActions(accessToken, accountId),
    ]);

    const athena   = athenaData?.profileChanges?.[0]?.profile;
    const common   = commonData?.profileChanges?.[0]?.profile;
    const campaign = campaignData?.profileChanges?.[0]?.profile;

    if (!athena || !common || !campaign) {
      return { success: false, error: 'Profile data unavailable' };
    }

    const storage = outpostData?.profileChanges?.[0]?.profile ?? null;

    // V-Bucks
    let vbucksAvailable = 0;
    for (const item of Object.values(common.items as Record<string, any>)) {
      if (item.templateId.startsWith('Currency:Mtx')) vbucksAvailable += item.quantity || 0;
    }

    // Zones completed
    const gStats: any[] = campaign.stats.attributes.gameplay_stats || [];
    const stw_zones_completed = gStats.find((s: any) => s.statName === 'zonescompleted')?.statValue ?? 0;

    // BR Stats
    let totalMatchesBR: number | null = null;
    try {
      const statsData = await axios.get(
        `${Endpoints.BR_STATS_V2}/account/${accountId}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
      );
      const s: Record<string, number> = statsData.data.stats || {};
      totalMatchesBR = Object.entries(s)
        .filter(([k]) => k.includes('br_') && k.includes('matchesplayed'))
        .reduce((acc, [, v]) => acc + v, 0);
    } catch {
      // stats proxy may not be accessible with all tokens
    }

    const sanctions = deriveFortniteSanctionFlags(
      common.stats.attributes as Record<string, unknown>,
      lightswitchStatus,
      eosSanctionActions,
    );

    const data = {
      accountId,
      email:                      accountInfo.email,
      displayName:                accountInfo.displayName || displayName,
      fullName:                   accountInfo.name ? `${accountInfo.name} ${accountInfo.lastName || ''}`.trim() : '  ',
      emailVerified:              accountInfo.emailVerified,
      twoFactor:                  accountInfo.tfaEnabled,
      lastLogin:                  accountInfo.lastLogin,
      canUpdateDisplayName:       accountInfo.canUpdateDisplayName,
      numberOfDisplayNameChanges: accountInfo.numberOfDisplayNameChanges,
      ...sanctions,
      athenaStats:       athena.stats.attributes,
      athenaItems:       athena.items || {},
      commonStats:       common.stats.attributes,
      commonItems:       common.items || {},
      campaignStats:     campaign.stats.attributes,
      campaignItems:     campaign.items || {},
      externalAuths:     Array.isArray(externalAuths) ? externalAuths : [],
      vbucksAvailable,
      totalMatchesBR,
      locker:            countLocker(athena.items || {}),
      stw_zones_completed,
      deviceAuths:       [] as any[],
    };

    // Fetch device auths (non-blocking)
    try {
      const launcherToken = await getLauncherToken(accessToken);
      if (launcherToken) {
        const daRes = await axios.get(
          `${Endpoints.ACCOUNT_DEVICEAUTH_LIST}/${accountId}/deviceAuth`,
          { headers: { Authorization: `Bearer ${launcherToken}` }, timeout: 10000 }
        );
        data.deviceAuths = daRes.data || [];
      }
    } catch {
      // Non-critical
    }

    //  ”€ ”€ Build report files  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
    const mdContent = buildMarkdown(data);
    const mdPath  = path.join(tmpDir, `checker_${accountId}.md`);
    const txtPath = path.join(tmpDir, `checker_${accountId}.txt`);
    const txPath  = path.join(tmpDir, `transactions_${accountId}.json`);
    const txJson  = buildTransactionsJson(data.commonStats, accountId);
    fs.writeFileSync(mdPath,  mdContent, 'utf-8');
    fs.writeFileSync(txtPath, mdContent, 'utf-8');
    fs.writeFileSync(txPath,  txJson,    'utf-8');

    const checkerImages = await generateCheckerImages({
      config: imageConfig,
      lang,
      accessToken,
      accountId,
      displayName: data.displayName,
      discordUserId: userId,
      athenaProfileBody: athenaData,
      campaignProfile: campaign,
      campaignProfileBody: campaignData,
      theaterProfileBody: theaterData,
      outpostProfile: storage,
      outpostProfileBody: outpostData,
      imageBranding: {
        siteUrl: customInviteLink,
        footerIconUrl: customFooterImageUrl,
      },
    });

    //  ”€ ”€ Build Discord embeds  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
    const author = await getMainAccountAuthor(userId, { accountId, accessToken, displayName: data.displayName }).catch(() => null);
    const reportEmbeds = buildCheckerReportEmbeds(data, client, author);
    const dmEmbeds: EmbedBuilder[] = [
      await buildCheckerReportIntroEmbed(data.displayName, accountId),
      ...reportEmbeds,
    ];

    // Friend Codes embed
    try {
      const FRIENDCODES_ENDPOINT = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/friendcodes';
      const [epicCodes, xboxCodes] = await Promise.all([
        axios.get<any[]>(`${FRIENDCODES_ENDPOINT}/${accountId}/epic`, {
          headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000,
        }).then(r => r.data).catch(() => []),
        axios.get<any[]>(`${FRIENDCODES_ENDPOINT}/${accountId}/xbox`, {
          headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000,
        }).then(r => r.data).catch(() => []),
      ]);
      if ((epicCodes.length + xboxCodes.length) > 0) {
        let desc = '';
        for (const [plat, codes] of [['Epic Games', epicCodes], ['Xbox', xboxCodes]] as [string, any[]][]) {
          if (codes.length > 0) {
            desc += `**${plat}** (${codes.length}):\n`;
            codes.forEach((code: any, i: number) => {
              const cType = code.codeType?.replace('CodeToken:', '') || 'Unknown';
              const created = code.dateCreated ? new Date(code.dateCreated).toLocaleDateString() : '  ';
              desc += `> \`${i + 1}.\` **${cType}**    Created: ${created}\n> Code: ||${code.codeId}||\n`;
            });
            desc += '\n';
          }
        }
        if (desc) {
          dmEmbeds.push(createDescriptionEmbed(
            'warning',
            truncateEmbedText(desc.trim(), DISCORD_EMBED_DESCRIPTION_SAFE),
            { title: 'STW Friend Codes' },
          ));
        }
      }
    } catch {
      // friend codes not available    skip
    }

    //  ”€ ”€ Send to DM  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
    await sendEmbedBatches(dmChannel, dmEmbeds, (error, context) => {
      log.commands.warn(
        {
          accountId,
          context,
          error: error instanceof Error ? error.message : String(error),
        },
        '[checker] DM embed send failed',
      );
    });

    // Send report + transactions files
    try {
      await dmChannel.send({
        files: [
          new AttachmentBuilder(fs.readFileSync(mdPath),  { name: `account_report_${accountId}.md` }),
          new AttachmentBuilder(fs.readFileSync(txtPath), { name: `account_report_${accountId}.txt` }),
          new AttachmentBuilder(Buffer.from(txJson, 'utf-8'), { name: `transactions_${accountId}.json` }),
        ],
      });
    } catch (err: unknown) {
      log.commands.warn(
        {
          accountId,
          error: err instanceof Error ? err.message : String(err),
        },
        '[checker] DM file send failed',
      );
    }

    // Send checker images
    for (const imageResult of checkerImages) {
      for (const page of imageResult.buffers) {
        try {
          await dmChannel.send({
            files: [new AttachmentBuilder(page.buffer, { name: page.fileName })],
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.commands.warn(
            { accountId, label: imageResult.label, error: message },
            '[checker] DM image send failed',
          );
        }
      }
    }

    //  ”€ ”€ Cleanup  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
    try {
      for (const p of [mdPath, txtPath, txPath]) { try { fs.unlinkSync(p); } catch { /* */ } }
    } catch { /* best-effort */ }

    return { success: true };
  } catch (err: any) {
    log.commands.error(
      { message: err?.message ?? String(err), accountId },
      '[checker] runAccountReport error'
    );
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

async function handleCheckerConfigure(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo) {
    const embed = await generarEmbedError('noCuenta', { client: interaction.client, interaction });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const preset = interaction.options.getString('preset') as CheckerImagePreset | null;
  const image = interaction.options.getString('image') as CheckerImageKey | null;
  const enabled = interaction.options.getBoolean('enabled');

  let config = await getCheckerImageConfig(userId);

  if (preset) {
    config = applyCheckerImagePreset(preset);
    await saveCheckerImageConfig(userId, config);
  } else if (image) {
    if (enabled === null) {
      const embed = await createErrorEmbed({
        description: await translateForUser(userId, 'checker.configure.errors.enabledRequired'),
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    config = mergeCheckerImageConfig({ ...config, [image]: enabled });
    await saveCheckerImageConfig(userId, config);
  }

  const lockerLines = await Promise.all(
    CHECKER_IMAGE_KEYS
      .filter((key) => key.startsWith('locker_'))
      .map((key) => formatCheckerConfigLine(userId, key, config[key])),
  );
  const stwLines = await Promise.all(
    CHECKER_IMAGE_KEYS
      .filter((key) => key.startsWith('stw_'))
      .map((key) => formatCheckerConfigLine(userId, key, config[key])),
  );

  const savedMessage = preset
    ? await translateForUser(userId, 'checker.configure.messages.presetApplied', { preset })
    : image
      ? await translateForUser(userId, 'checker.configure.messages.imageUpdated', {
        image,
        state: enabled ? 'on' : 'off',
      })
      : null;

  const embed = await createEmbed({
    style: embedStyleFromTone('neutral'),
    title: await translateForUser(userId, 'checker.configure.title'),
    description: await translateForUser(userId, 'checker.configure.description'),
    fields: [
      {
        name: await translateForUser(userId, 'checker.configure.fields.locker'),
        value: lockerLines.join('\n') || '—',
      },
      {
        name: await translateForUser(userId, 'checker.configure.fields.stw'),
        value: stwLines.join('\n') || '—',
      },
    ],
    footer: savedMessage ? { text: savedMessage } : undefined,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function formatCheckerConfigLine(
  userId: string,
  key: CheckerImageKey,
  enabled: boolean,
): Promise<string> {
  const label = await translateForUser(userId, `checker.configure.images.${key}`);
  return `${enabled ? '✅' : '❌'} ${label}`;
}

async function handleCheckerRun(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  try {
    // This command is `nodefer`, so it must answer within Discord's 3 s window. A user's full document
    // carries every linked account (tens of KB, ~1.5 s to read), so only the main account is read here.
    const mainDoc = await UsuarioInfo.findOne(
      { id: userId, 'deviceAuths.cuentaMain': true },
      { 'deviceAuths.$': 1 },
    ).lean<{ deviceAuths?: { accountId: string; displayName: string; deviceId?: string; secret?: string }[] }>();
    const mainAccount = mainDoc?.deviceAuths?.[0];

    if (!mainAccount) {
      const hasUser = await UsuarioInfo.exists({ id: userId });
      const embed = await generarEmbedError(hasUser ? 'noMain' : 'noCuenta', { client, interaction });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const state: CheckerPanelState = {
      savedMainAccount: {
        accountId: mainAccount.accountId,
        displayName: mainAccount.displayName,
        deviceId: mainAccount.deviceId,
        secret: mainAccount.secret,
      },
      tempAccount: null,
      customInviteLink: undefined,
      view: 'main',
      confirmAction: null,
      statusTone: 'neutral',
      busy: false,
    };

    await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.opened');

    const replyPayload = await buildCheckerPanelReply(interaction, state);
    const panelMessage = await interaction.reply({
      embeds: replyPayload.embeds,
      components: replyPayload.components,
      files: replyPayload.files,
      fetchReply: true,
    });

    const refreshPanel = async (disabled = false): Promise<void> => {
      try {
        const payload = await buildCheckerPanelReply(interaction, state, { disabled });
        await interaction.editReply({
          embeds: payload.embeds,
          components: payload.components,
          files: payload.files,
        });
      } catch {
        // Ignore expired interaction edits.
      }
    };

    const requirePremium = async (): Promise<boolean> => {
      const premium = await checkUserPremium(userId);
      if (premium.hasPremium) {
        return true;
      }

      await setCheckerPanelStatus(userId, state, 'warning', 'checker.panel.messages.premiumRequired');
      await refreshPanel();
      return false;
    };

    const runCurrentReport = async (): Promise<void> => {
      const dmChannel = await getCheckerDmChannel(interaction);
      if (!dmChannel) {
        await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.dmDisabled');
        return;
      }

      const currentAccount = await resolveCurrentCheckerAccount(userId, state);
      await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.runStarted', {
        name: cleanInlineValue(currentAccount.displayName, 48),
      });
      await refreshPanel();

      const [imageConfig, lang] = await Promise.all([
        getCheckerImageConfig(userId),
        getUserLanguage(userId, interaction.locale ?? interaction.guildLocale),
      ]);

      const result = await runAccountReport({
        accessToken: currentAccount.accessToken,
        accountId: currentAccount.accountId,
        displayName: currentAccount.displayName,
        userId,
        client,
        dmChannel,
        customInviteLink: state.customInviteLink,
        customFooterImageUrl: state.customFooterImageUrl,
        imageConfig,
        lang,
      });

      if (result.success) {
        await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.runSuccess', {
          name: cleanInlineValue(currentAccount.displayName, 48),
        });
      } else {
        await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.runFailed', {
          error: cleanInlineValue(result.error || 'Unknown error', 120),
        });
      }
    };

    const collector = (panelMessage as any).createMessageComponentCollector({
      componentType: ComponentType.Button,
      idle: CHECKER_PANEL_TIMEOUT,
      filter: (component: ButtonInteraction) => component.user.id === interaction.user.id,
    });

    collector.on('collect', async (component: ButtonInteraction) => {
      try {
        if (component.customId === 'checker_panel_back') {
          await component.deferUpdate();
          state.view = 'main';
          await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.opened');
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_cancel') {
          await component.deferUpdate();
          state.confirmAction = null;
          await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.cancelled');
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_cancel_easy_login') {
          await component.deferUpdate();
          if (state.easyLogin) {
            state.easyLogin.cancelled = true;
          }
          state.easyLogin = undefined;
          state.view = 'main';
          clearAuthSession(userId);
          await setCheckerPanelStatus(userId, state, 'warning', 'checker.panel.messages.loginCancelled');
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_login_toggle') {
          await component.deferUpdate();
          state.confirmAction = null;
          if (state.tempAccount) {
            state.tempAccount = null;
            state.view = 'main';
            await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.switchedToMain');
          } else {
            state.view = 'login';
            await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.loginView');
          }
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_remove_current') {
          await component.deferUpdate();
          state.confirmAction = 'remove_current';
          await setCheckerPanelStatus(userId, state, 'warning', 'checker.panel.messages.confirmCurrent');
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_remove_bulk') {
          await component.deferUpdate();
          state.confirmAction = 'remove_bulk';
          await setCheckerPanelStatus(userId, state, 'warning', 'checker.panel.messages.confirmBulk');
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_confirm') {
          await component.deferUpdate();
          const action = state.confirmAction;
          state.confirmAction = null;
          state.busy = true;

          try {
            if (action === 'remove_current') {
              const currentAccount = await resolveCurrentCheckerAccount(userId, state);
              await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.removeCurrentStarted', {
                name: cleanInlineValue(currentAccount.displayName, 48),
              });
              await refreshPanel();
              await removeAllFriendsForAccount(currentAccount.accountId, currentAccount.accessToken);
              await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.removeCurrentSuccess', {
                name: cleanInlineValue(currentAccount.displayName, 48),
              });
            } else if (action === 'remove_bulk') {
              const userInfoFresh = await UsuarioInfo.findOne({ id: userId });
              if (!userInfoFresh?.deviceAuths?.length) {
                throw new Error('NO_SAVED_ACCOUNT');
              }

              let succeeded = 0;
              let failed = 0;
              for (let index = 0; index < userInfoFresh.deviceAuths.length; index++) {
                const accountDoc = userInfoFresh.deviceAuths[index] as any;
                await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.removeBulkProgress', {
                  current: index + 1,
                  total: userInfoFresh.deviceAuths.length,
                  name: cleanInlineValue(accountDoc.displayName || accountDoc.accountId, 40),
                });
                await refreshPanel();

                try {
                  const { account, error } = await refreshAccountToken(userInfoFresh, accountDoc.accountId);
                  if (!account || error) {
                    failed++;
                    continue;
                  }

                  await removeAllFriendsForAccount(account.accountId, account.accessToken);
                  succeeded++;
                } catch {
                  failed++;
                }
              }

              await setCheckerPanelStatus(userId, state, failed > 0 ? 'warning' : 'success', 'checker.panel.messages.removeBulkSuccess', {
                succeeded,
                total: userInfoFresh.deviceAuths.length,
                failed,
              });
            }
          } catch (error: any) {
            const errorCode = error?.message ?? 'UNKNOWN';
            const errorKey = errorCode === 'NO_SAVED_ACCOUNT'
              ? 'checker.panel.messages.noSavedAccounts'
              : 'checker.panel.messages.actionFailed';
            await setCheckerPanelStatus(userId, state, 'error', errorKey, {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_bulk') {
          await component.deferUpdate();
          if (!await requirePremium()) {
            return;
          }

          state.busy = true;
          try {
            const bulkResult = await handleCheckerBulk(interaction, {
              customInviteLink: state.customInviteLink,
              customFooterImageUrl: state.customFooterImageUrl,
            }, async (message: string) => {
              state.statusTone = 'neutral';
              state.statusMessage = message;
              await refreshPanel();
            });

            await setCheckerPanelStatus(userId, state, bulkResult.failed > 0 ? 'warning' : 'success', 'checker.panel.messages.bulkComplete', {
              succeeded: bulkResult.succeeded,
              total: bulkResult.total,
              failed: bulkResult.failed,
            });
          } catch (error: any) {
            const errorCode = error?.message ?? 'UNKNOWN';
            const errorKey = errorCode === 'DM_DISABLED'
              ? 'checker.panel.messages.dmDisabled'
              : errorCode === 'NO_SAVED_ACCOUNT'
                ? 'checker.panel.messages.noSavedAccounts'
                : 'checker.panel.messages.actionFailed';
            await setCheckerPanelStatus(userId, state, 'error', errorKey, {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_run') {
          await component.deferUpdate();
          state.busy = true;
          try {
            await runCurrentReport();
          } catch (error: any) {
            const errorCode = error?.message ?? 'UNKNOWN';
            const errorKey = errorCode === 'NO_SAVED_ACCOUNT'
              ? 'checker.panel.messages.noSavedAccounts'
              : errorCode === 'NO_MAIN_ACCOUNT'
                ? 'checker.panel.messages.noMainAccount'
                : errorCode === 'TEMP_AUTH_EXPIRED'
                  ? 'checker.panel.messages.tempExpired'
                  : 'checker.panel.messages.actionFailed';
            await setCheckerPanelStatus(userId, state, 'error', errorKey, {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_customize') {
          if (!await requirePremium()) {
            await component.deferUpdate();
            return;
          }

          const submitted = await showCustomizeModal(
            component,
            userId,
            state.customInviteLink,
            state.customFooterImageUrl,
          );

          if (!submitted) {
            return;
          }

          await submitted.deferUpdate();
          const inviteLink = submitted.fields.getTextInputValue('invite_link').trim();
          const footerIconUrl = submitted.fields.getTextInputValue('footer_icon_url').trim();
          state.customInviteLink = inviteLink || undefined;
          state.customFooterImageUrl = footerIconUrl || undefined;
          const savedParts = [
            inviteLink ? `link: ${cleanInlineValue(inviteLink, 60)}` : '',
            footerIconUrl ? `icon: ${cleanInlineValue(footerIconUrl, 60)}` : '',
          ].filter(Boolean).join(' · ');
          await setCheckerPanelStatus(
            userId,
            state,
            'success',
            inviteLink || footerIconUrl
              ? 'checker.panel.messages.customizeSaved'
              : 'checker.panel.messages.customizeCleared',
            savedParts ? { value: savedParts } : undefined,
          );
          await refreshPanel();
          return;
        }

        if (component.customId === 'checker_panel_launch') {
          await component.deferUpdate();
          state.busy = true;

          try {
            const currentAccount = await resolveCurrentCheckerAccount(userId, state);
            await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.launchPreparing', {
              name: cleanInlineValue(currentAccount.displayName, 48),
            });
            await refreshPanel();

            const launchCommand = await buildLaunchCommandForAccount(currentAccount);
            if (!launchCommand) {
              throw new Error('LAUNCH_FAILED');
            }

            const launchEmbed = await createSuccessEmbed({
              title: await translateForUser(userId, 'checker.panel.launch.title'),
              description: await translateForUser(userId, 'checker.panel.launch.description', {
                name: cleanInlineValue(currentAccount.displayName, 48),
                cmd: launchCommand,
              }),
              interaction,
            });

            await component.followUp({ embeds: [launchEmbed], ephemeral: true });
            await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.launchSent', {
              name: cleanInlineValue(currentAccount.displayName, 48),
            });
          } catch (error: any) {
            const errorKey = error?.message === 'TEMP_AUTH_EXPIRED'
              ? 'checker.panel.messages.tempExpired'
              : 'checker.panel.messages.launchFailed';
            await setCheckerPanelStatus(userId, state, 'error', errorKey, {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_login_easy') {
          await component.deferUpdate();

          if (getAuthSession(userId)) {
            await setCheckerPanelStatus(userId, state, 'warning', 'checker.panel.messages.authAlreadyActive');
            await refreshPanel();
            return;
          }

          try {
            const easyLogin = await beginTemporaryEasyLogin();
            createAuthSession(userId, `checker-panel-${interaction.id}`);
            state.easyLogin = {
              verificationUrl: easyLogin.verificationUrl,
              deviceCode: easyLogin.deviceCode,
              cancelled: false,
            };
            await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.easyLoginPending');
            await refreshPanel();

            void (async () => {
              try {
                const tempAccount = await pollTemporaryEasyLogin(easyLogin.deviceCode, {
                  isCancelled: () => !!state.easyLogin?.cancelled,
                });

                if (!state.easyLogin || state.easyLogin.cancelled) {
                  return;
                }

                state.tempAccount = tempAccount;
                state.easyLogin = undefined;
                state.view = 'main';
                clearAuthSession(userId);
                await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.loginSuccess', {
                  name: cleanInlineValue(tempAccount.displayName, 48),
                });
                await refreshPanel();
              } catch (error: any) {
                clearAuthSession(userId);
                if (error?.message === 'TEMP_AUTH_CANCELLED') {
                  return;
                }

                state.easyLogin = undefined;
                state.view = 'login';
                const errorKey = error?.message === 'TEMP_AUTH_TIMEOUT'
                  ? 'checker.panel.messages.loginTimedOut'
                  : 'checker.panel.messages.loginFailed';
                await setCheckerPanelStatus(userId, state, 'error', errorKey, {
                  error: cleanInlineValue(error?.message || 'Unknown error', 120),
                });
                await refreshPanel();
              }
            })();
          } catch (error: any) {
            await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.loginFailed', {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_login_auth') {
          const submitted = await showSingleTextModal(
            component,
            'checker_panel_auth_code_modal',
            await translateForUser(userId, 'checker.panel.modals.authCode.title'),
            await translateForUser(userId, 'checker.panel.modals.authCode.label'),
            await translateForUser(userId, 'checker.panel.modals.authCode.placeholder'),
          );
          if (!submitted) {
            return;
          }

          await submitted.deferUpdate();
          state.busy = true;
          try {
            await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.loginProcessing');
            await refreshPanel();
            const tempAccount = await createTemporaryAccountFromAuthorizationCode(submitted.fields.getTextInputValue('value').trim());
            state.tempAccount = tempAccount;
            state.view = 'main';
            await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.loginSuccess', {
              name: cleanInlineValue(tempAccount.displayName, 48),
            });
          } catch (error: any) {
            await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.loginFailed', {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_login_exchange') {
          const submitted = await showSingleTextModal(
            component,
            'checker_panel_exchange_code_modal',
            await translateForUser(userId, 'checker.panel.modals.exchangeCode.title'),
            await translateForUser(userId, 'checker.panel.modals.exchangeCode.label'),
            await translateForUser(userId, 'checker.panel.modals.exchangeCode.placeholder'),
          );
          if (!submitted) {
            return;
          }

          await submitted.deferUpdate();
          state.busy = true;
          try {
            await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.loginProcessing');
            await refreshPanel();
            const tempAccount = await createTemporaryAccountFromExchangeCode(submitted.fields.getTextInputValue('value').trim());
            state.tempAccount = tempAccount;
            state.view = 'main';
            await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.loginSuccess', {
              name: cleanInlineValue(tempAccount.displayName, 48),
            });
          } catch (error: any) {
            await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.loginFailed', {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }

        if (component.customId === 'checker_panel_login_device_auth') {
          const submitted = await showDeviceAuthModal(component, userId);
          if (!submitted) {
            return;
          }

          await submitted.deferUpdate();
          state.busy = true;
          try {
            await setCheckerPanelStatus(userId, state, 'neutral', 'checker.panel.messages.loginProcessing');
            await refreshPanel();
            const tempAccount = await createTemporaryAccountFromDeviceAuth(
              submitted.fields.getTextInputValue('account_id').trim(),
              submitted.fields.getTextInputValue('device_id').trim(),
              submitted.fields.getTextInputValue('secret').trim(),
            );
            state.tempAccount = tempAccount;
            state.view = 'main';
            await setCheckerPanelStatus(userId, state, 'success', 'checker.panel.messages.loginSuccess', {
              name: cleanInlineValue(tempAccount.displayName, 48),
            });
          } catch (error: any) {
            await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.loginFailed', {
              error: cleanInlineValue(error?.message || 'Unknown error', 120),
            });
          } finally {
            state.busy = false;
            await refreshPanel();
          }
          return;
        }
      } catch (error: any) {
        state.busy = false;
        state.confirmAction = null;
        await setCheckerPanelStatus(userId, state, 'error', 'checker.panel.messages.actionFailed', {
          error: cleanInlineValue(error?.message || 'Unknown error', 120),
        });
        await refreshPanel();
      }
    });

    collector.on('end', async (_: unknown, reason: string) => {
      if (state.easyLogin) {
        state.easyLogin.cancelled = true;
        state.easyLogin = undefined;
        clearAuthSession(userId);
      }
      if (!isCollectorIdle(reason)) return;
      await setCheckerPanelStatus(userId, state, 'warning', 'checker.panel.messages.expired');
      await refreshPanel(true);
    });
  } catch (err: any) {
    log.commands.error(
      { message: err?.message ?? String(err), code: err?.response?.status ?? err?.code },
      '[checker] Error opening checker panel'
    );

    const embed = await createErrorEmbed({
      title: 'Error',
      description: `An error occurred while opening the checker panel.\n\`${err?.message ?? 'Unknown error'}\``,
      interaction,
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
}


async function handleCheckerAddExclusive(interaction: ChatInputCommandInteraction): Promise<void> {
  const cosmeticId = interaction.options.getString('cosmetic', true);

  //  ”€ ”€ 1. Show TOS  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
  const tosEmbed = new EmbedBuilder()
    .setColor(0xff6600)
    .setTitle(' š ï¸ Terms of Service    Exclusive Submission')
    .setDescription(
      '**Before submitting a cosmetic for review, please read and accept the following:**\n\n' +
      '>   • You must own the account that holds this cosmetic.\n' +
      '>   • The developer is **not responsible** for how this information is used.\n' +
      '>   • Submissions are reviewed manually and may not always be added.\n' +
      '>   • Do not submit cosmetics you do not own or that are not exclusive.\n\n' +
      '**By clicking Accept, you confirm you have read and agree to the above.**'
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tos_accept').setLabel(' œ… I Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tos_decline').setLabel(' Œ Cancel').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [tosEmbed], components: [row], ephemeral: true });

  //  ”€ ”€ 2. Await TOS response  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
  let btn: Awaited<ReturnType<typeof interaction.fetchReply>>['awaitMessageComponent'] extends (...args: any[]) => infer R ? Awaited<R> : never;
  try {
    const reply = await interaction.fetchReply();
    btn = await reply.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
      componentType: ComponentType.Button,
    });
  } catch {
    await interaction.editReply({
      embeds: [
        await buildGatewayEmbed(interaction.client as ExtendedClient, interaction.user.id, interaction.locale, 'error', {
          emojiKey: 'importante',
          titleKey: 'gateway.errorTitle',
          bodyKey: 'gateway.errors.timeout.description',
          solutionKey: 'gateway.errors.timeout.solution',
        }),
      ],
      components: [],
    });
    return;
  }

  if (btn.customId === 'tos_decline') {
    await btn.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x555555)
          .setTitle('Cancelled')
          .setDescription('Submission cancelled.'),
      ],
      components: [],
    });
    return;
  }

  // User accepted
  await btn.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Processing €¦')
        .setDescription('Fetching cosmetic info €¦'),
    ],
    components: [],
  });

  //  ”€ ”€ 3. Fetch cosmetic details  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
  let cosmetic: any;
  try {
    const res = await axios.get(
      `https://fortnite-api.com/v2/cosmetics/br/${encodeURIComponent(cosmeticId)}`,
      { timeout: 10_000 }
    );
    cosmetic = res.data?.data;
  } catch {
    await interaction.editReply({
      embeds: [
        await buildGatewayEmbed(interaction.client as ExtendedClient, interaction.user.id, interaction.locale, 'error', {
          emojiKey: 'importante',
          titleKey: 'gateway.errorTitle',
          bodyKey: 'gateway.errors.cosmeticFetch.description',
          bodyReplacements: { cosmeticId },
          solutionKey: 'gateway.errors.cosmeticFetch.solution',
        }),
      ],
    });
    return;
  }

  if (!cosmetic) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Not Found')
          .setDescription(`Cosmetic \`${cosmeticId}\` not found.`),
      ],
    });
    return;
  }

  //  ”€ ”€ 4. Send submission to dev DM  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
  const imageUrl: string | null = cosmetic.images?.featured ?? cosmetic.images?.icon ?? null;

  const submissionEmbed = new EmbedBuilder()
    .setColor(0x8a2be2)
    .setTitle('ðŸ“¥ New Exclusive Suggestion')
    .addFields(
      { name: 'Name',      value: cosmetic.name ?? cosmeticId,                                   inline: true },
      { name: 'ID',        value: cosmetic.id   ?? cosmeticId,                                   inline: true },
      { name: 'Type',      value: cosmetic.type?.displayValue ?? cosmetic.type?.value ?? '  ',     inline: true },
      { name: 'Rarity',    value: cosmetic.rarity?.displayValue ?? cosmetic.rarity?.value ?? '  ', inline: true },
      { name: 'Series',    value: cosmetic.series?.value ?? 'None',                               inline: true },
      { name: 'Submitted', value: `<@${interaction.user.id}> (${interaction.user.tag})`,          inline: false },
    )
    .setTimestamp();

  if (imageUrl) submissionEmbed.setThumbnail(imageUrl);

  const devId = process.env.DEVELOPER_IDS?.split(',')[0]?.trim() ?? '807586817581908008';
  try {
    const devUser = await interaction.client.users.fetch(devId);
    const devDm = await devUser.createDM();
    await devDm.send({ embeds: [submissionEmbed] });
  } catch {
    log.commands.error(
      { cosmeticId, userId: interaction.user.id },
      '[checker] Failed to DM exclusive suggestion to dev'
    );
  }

  //  ”€ ”€ 5. Reply success  ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€ ”€
  const successEmbed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle(' œ… Suggestion Submitted')
    .setDescription(
      `Your suggestion for **${cosmetic.name ?? cosmeticId}** (\`${cosmetic.id ?? cosmeticId}\`) has been submitted for review.\n\nThank you! The developer will review it manually.`
    );

  if (imageUrl) successEmbed.setThumbnail(imageUrl);

  await interaction.editReply({ embeds: [successEmbed] });
}

export default command;
