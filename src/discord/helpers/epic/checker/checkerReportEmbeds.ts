import type { EmbedBuilder } from 'discord.js';
import { getAppEmojiByName } from '#helpers/core/emojis.ts';
import {
  createDescriptionEmbed,
  createInfoEmbed,
  DISCORD_EMBED_DESCRIPTION_SAFE,
  truncateEmbedText,
} from '#helpers/core/embedHelper.ts';

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const RARITY_EMOJI_NAMES: Record<string, string> = {
  Common: 'rarities_c',
  Uncommon: 'rarities_uc',
  Rare: 'rarities_r',
  Epic: 'rarities_vr',
  Legendary: 'rarities_sr',
  Mythic: 'rarities_er',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    + ' @ '
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    + ' UTC'
  );
}

function daysAgo(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  return `${Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)} days ago`;
}

const yesNo = (v: unknown): string => (v ? 'Yes' : 'No');
const numFmt = (n: unknown): string => (Number(n) || 0).toLocaleString('en-US');
const clip = (text: string): string => truncateEmbedText(text, DISCORD_EMBED_DESCRIPTION_SAFE);

function splitEmbedDescription(text: string, maxChunk = DISCORD_EMBED_DESCRIPTION_SAFE): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunk) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > maxChunk) {
    let cut = rest.lastIndexOf('\n', maxChunk);
    if (cut < Math.floor(maxChunk * 0.4)) cut = maxChunk;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function pushDescriptionEmbeds(
  embeds: EmbedBuilder[],
  title: string,
  desc: string,
  author?: { name: string; iconURL: string },
): void {
  const chunks = splitEmbedDescription(desc);
  chunks.forEach((chunk, index) => {
    const embed = createDescriptionEmbed('info', clip(chunk), {
      title: chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title,
    });
    if (author && embeds.length === 0 && index === 0) {
      embed.setAuthor(author);
    }
    embeds.push(embed);
  });
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
  const weapons = [
    'pistol', 'shotgun', 'rifle', 'sniper', 'smg', 'lmg', 'assault', 'minigun', 'launcher',
    'bow', 'crossbow', 'explosive', 'melee', 'sword', 'axe', 'scythe', 'hammer', 'club',
    'spear', 'edged', 'blunt', 'knife', 'bat', 'wrench', 'deathray', 'typewriter',
    'plasmagun', 'raygun', 'flintlock', 'gravedigger', 'neon', 'nocturno',
    'endgame', 'vacuum', 'obliterator', 'rocket', 'grenade',
  ];
  if (traps.some((x) => t.includes(x))) return 'Trap';
  if (weapons.some((x) => t.includes(x))) return 'Weapon';
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

function rarityLine(client: unknown, counter: Record<string, number>): string {
  return RARITY_ORDER
    .filter((r) => counter[r])
    .map((r) => `${getAppEmojiByName(client as never, RARITY_EMOJI_NAMES[r])} **${counter[r]}**`)
    .join('  ');
}

export async function buildCheckerReportIntroEmbed(
  displayName: string,
  accountId: string,
): Promise<EmbedBuilder> {
  return createInfoEmbed({
    title: 'Checker Report',
    description: clip(`Account **${displayName}** (\`${accountId}\`)\nFull report below.`),
    timestamp: true,
  });
}

export function buildCheckerReportEmbeds(
  d: Record<string, any>,
  client: unknown,
  authorInfo?: { name: string; iconURL: string } | null,
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];
  const author = authorInfo ? { name: authorInfo.name, iconURL: authorInfo.iconURL } : undefined;

  {
    const purch: any[] = d.commonStats?.mtx_purchase_history?.purchases ?? [];
    const lastPurch = purch.length
      ? [...purch].sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0]
      : null;
    const lastTxLine = lastPurch
      ? `\n**Last Transaction:** ${fmtDate(lastPurch.purchaseDate)}  · \`${lastPurch.lootResult?.[0]?.itemType?.split(':')[1] ?? 'Unknown'}\`  · ${numFmt(lastPurch.totalMtxPaid)} VB${lastPurch.refundDate ? ' *(refunded)*' : ''}`
      : '';

    pushDescriptionEmbeds(embeds, 'Account Information', (
      `**Account ID:** \`${d.accountId}\`\n`
      + `**Email:** ${d.email || '  '}\n`
      + `**Email Verified:** ${yesNo(d.emailVerified)}\n`
      + `**Display Name:** ${d.displayName || '  '}\n`
      + `**Full Name:** ${d.fullName || '  '}\n`
      + `**2FA Enabled:** ${yesNo(d.twoFactor)}\n`
      + `**Last Login:** ${fmtDate(d.lastLogin)}\n`
      + `**Can Change Name:** ${yesNo(d.canUpdateDisplayName)} (${d.numberOfDisplayNameChanges ?? 0} changes)`
      + lastTxLine
    ), author);
  }

  pushDescriptionEmbeds(embeds, 'Ban & Restriction Info', (
    `**Never Sanctioned:** ${yesNo(!d.activeSanctions)}\n`
    + `**FN Entitlement Access:** ${yesNo(!d.fnEntitlementBan)}\n`
    + `**Epic Social Access:** ${yesNo(!d.epicSocialBan)}\n`
    + `**FN Matchmaking Access:** ${yesNo(!d.fnMatchmakingBan)}`
  ));

  {
    const a = d.athenaStats;
    pushDescriptionEmbeds(embeds, 'Account Statistics', (
      `**Account Level:** ${numFmt(a.accountLevel)}\n`
      + `**2FA Reward Claimed:** ${yesNo(a.mfa_reward_claimed)}\n`
      + `**Lifetime Wins (BR):** ${numFmt(a.lifetime_wins)}\n`
      + `**Total Matches (BR):** ${d.totalMatchesBR != null ? numFmt(d.totalMatchesBR) : 'Unavailable'}\n`
      + `**Last BR Match:** ${fmtDate(a.last_match_end_datetime)} (${daysAgo(a.last_match_end_datetime)})\n`
      + `**Last STW Match:** ${fmtDate(a.last_stw_match_end_datetime)} (${daysAgo(a.last_stw_match_end_datetime)})\n\n`
      + `**Season XP:** ${numFmt(a.xp)}\n`
      + `**Cumulative XP:** ${numFmt(a.rested_xp_consumed_cumulative)}\n`
      + `**Rested XP:** ${numFmt(a.rested_xp)} (x${a.rested_xp_mult ?? '  '})`
    ));
  }

  {
    const a = d.athenaStats;
    pushDescriptionEmbeds(embeds, 'Current Season', (
      `**Season:** ${a.season_num ?? 'N/A'}\n`
      + `**Level:** ${a.level ?? 0}\n`
      + `**Battle Pass Level:** ${a.book_level ?? 0}\n`
      + `**Battle Pass XP (of this level):** ${numFmt(a.book_xp)}`
    ));
  }

  {
    const seasons = [...(d.athenaStats.past_seasons || [])].sort((x: any, y: any) => x.seasonNumber - y.seasonNumber);
    if (seasons.length > 0) {
      let desc = '';
      for (const s of seasons) {
        const bp = s.purchasedVIP ? '✅' : '❌';
        desc += `**S${s.seasonNumber}** — BP Lv ${s.bookLevel ?? 0}  · ${s.numWins ?? 0}Wins  · purchased: ${bp}\n`;
      }
      pushDescriptionEmbeds(embeds, 'Past Seasons', desc);
    }
  }

  {
    const cc = d.commonStats;
    const mtxH = cc.mtx_purchase_history || {};
    const purch: any[] = mtxH.purchases || [];
    const vbSpent = purch.reduce((s: number, p: any) => s + (p.totalMtxPaid || 0), 0);
    const refUsed = mtxH.refundsUsed || 0;
    const giftH = cc.gift_history || {};

    let desc =
      `**V-Bucks Available:** ${numFmt(d.vbucksAvailable)} VB\n`
      + `**V-Bucks Spent (log):** ${numFmt(vbSpent)} VB\n`
      + `**Refund Credits:** ${Math.max(0, 3 - refUsed)} / 3 (used: ${refUsed})\n`
      + `**Return Tickets Active:** ${(cc.undo_cooldowns || []).length}\n`
      + `**Creator Code:** \`${cc.mtx_affiliate || 'None'}\`\n`
      + `**Purchase Platform:** ${cc.current_mtx_platform || '  '}\n`
      + `**Can Send Gifts:** ${yesNo(cc.allowed_to_send_gifts)}\n`
      + `**Gifts Sent:** ${numFmt(giftH.num_sent)}  · **Received:** ${numFmt(giftH.num_received)}\n`;

    const sorted = [...purch].sort((a: any, b: any) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()).slice(0, 10);
    if (sorted.length > 0) {
      desc += '\n**Last 10 Purchases:**\n';
      for (const p of sorted) {
        const itm = p.lootResult?.[0]?.itemType?.split(':')[1] ?? 'Unknown';
        const est = p.refundDate ? '🔄 Refunded' : '';
        desc += `> ${fmtDate(p.purchaseDate)}  · \`${itm}\`  · ${numFmt(p.totalMtxPaid)} VB ${est}\n`;
      }
    }
    pushDescriptionEmbeds(embeds, 'V-Bucks & Purchases', desc);
  }

  {
    const locker = d.locker;
    const total = Object.values(locker).reduce((s: number, v: any) => s + v, 0);
    let desc = `**Total Locker Items: ${numFmt(total)}**\n\n`;
    for (const [cat, cnt] of Object.entries(locker)) {
      if (cnt as number > 0) desc += `  • **${cat}:** ${cnt}\n`;
    }
    pushDescriptionEmbeds(embeds, 'Locker Stats', desc);
  }

  {
    let desc = '';
    if (!d.externalAuths?.length) {
      desc = '*No external accounts connected.*';
    } else {
      for (const auth of d.externalAuths) {
        const plat = auth.type || auth.externalAuthType || '  ';
        const name = auth.externalDisplayName || auth.externalAuthId || '  ';
        desc += `  • **${plat}**    ${name}\n`;
      }
    }
    pushDescriptionEmbeds(embeds, 'Connected Accounts', desc);
  }

  {
    const auths: any[] = d.deviceAuths || [];
    if (auths.length > 0) {
      let desc = `**Total:** ${auths.length} device auth(s)\n\n`;
      const shown = auths.slice(0, 15);
      for (let i = 0; i < shown.length; i++) {
        const a = shown[i];
        const loc = a.created?.location || a.lastAccess?.location || '  ';
        const ip = a.created?.ipAddress || a.lastAccess?.ipAddress || '';
        const maskedIp = ip ? `${ip.split('.').slice(0, 2).join('.')}.***.***` : '  ';
        const ua = a.userAgent || '  ';
        const shortUa = ua.length > 50 ? `${ua.substring(0, 47)}...` : ua;
        const created = a.created?.dateTime ? `<t:${Math.floor(new Date(a.created.dateTime).getTime() / 1000)}:R>` : '  ';
        const lastAccess = a.lastAccess?.dateTime ? `<t:${Math.floor(new Date(a.lastAccess.dateTime).getTime() / 1000)}:R>` : '  ';
        desc += `**#${i + 1}** \`${loc}\`    IP: \`${maskedIp}\`\n`;
        desc += `> Device: \`${shortUa}\`\n`;
        desc += `> Created: ${created}  · Last: ${lastAccess}\n`;
      }
      if (auths.length > 15) desc += `\n*...and ${auths.length - 15} more*`;
      pushDescriptionEmbeds(embeds, 'Device Auths', desc);
    } else {
      embeds.push(createDescriptionEmbed('info', '*No device auths found or unable to fetch.*', { title: 'Device Auths' }));
    }
  }

  {
    const cs = d.campaignStats;
    const ci = d.campaignItems;

    let desc =
      `**STW Level:** ${cs.level ?? 0}\n`
      + `**STW XP:** ${numFmt(cs.xp)}\n`
      + `**Matches Played:** ${numFmt(cs.matches_played)}\n`
      + `**Zones Completed:** ${numFmt(d.stw_zones_completed)}\n`
      + `**MFA Reward:** ${yesNo(cs.mfa_reward_claimed)}\n`
      + `**Collection Book Lv:** ${numFmt(cs.collection_book?.maxBookXpLevelAchieved)}\n`
      + `**Research Points Spent:** ${numFmt(cs.legacy_research_points_spent)}\n`
      + `**Total Login Days:** ${numFmt(cs.daily_rewards?.totalDaysLoggedIn)}\n`;

    const rl = cs.research_levels || {};
    if (Object.keys(rl).length > 0) {
      desc += '\n**Research Levels:**\n';
      for (const [k, v] of Object.entries(rl)) {
        desc += `> ${k.charAt(0).toUpperCase() + k.slice(1)}: **${v}**\n`;
      }
    }

    const heroItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Hero:'));
    const heroRarities: Record<string, number> = {};
    const heroClasses: Record<string, number> = {};
    for (const h of heroItems as any[]) {
      const r = h.attributes?.starting_rarity || 'Unknown';
      const c = getHeroClass(h.templateId);
      heroRarities[r] = (heroRarities[r] || 0) + 1;
      heroClasses[c] = (heroClasses[c] || 0) + 1;
    }
    desc += `\n**Heroes (${heroItems.length}):** `;
    desc += Object.entries(heroClasses).map(([c, n]) => `${c}: ${n}`).join('  · ');
    desc += `\n${rarityLine(client, heroRarities)}\n`;

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
    desc += `\n**Survivors (${workerItems.length}):** Leads: ${leadsCount}  · Basic: ${basicCount}\n`;
    desc += `${rarityLine(client, workerRar)}\n`;

    const defItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Defender:'));
    const defRar: Record<string, number> = {};
    for (const def of defItems as any[]) {
      const r = def.attributes?.starting_rarity || 'Unknown';
      defRar[r] = (defRar[r] || 0) + 1;
    }
    desc += `\n**Defenders (${defItems.length}):**\n`;
    desc += `${rarityLine(client, defRar)}\n`;

    const schItems = Object.values(ci).filter((i: any) => i.templateId.startsWith('Schematic:'));
    const schRar: Record<string, number> = {};
    const schTiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const schTypes: Record<string, number> = { Weapon: 0, Trap: 0, Other: 0 };

    for (const s of schItems as any[]) {
      const r = s.attributes?.starting_rarity || 'Unknown';
      const lvl = s.attributes?.level || 1;
      const tier = getSchematicTier(s.templateId, lvl);
      const type = getSchematicType(s.templateId);
      schRar[r] = (schRar[r] || 0) + 1;
      schTiers[tier] = (schTiers[tier] || 0) + 1;
      schTypes[type] = (schTypes[type] || 0) + 1;
    }
    desc += `\n**Schematics (${schItems.length}):** Weapons: ${schTypes.Weapon}  · Traps: ${schTypes.Trap}  · Other: ${schTypes.Other}\n`;
    desc += `${rarityLine(client, schRar)}\n`;
    desc += '\nBy Tier:\n';
    for (let t = 1; t <= 6; t++) {
      if (schTiers[t]) desc += `> **T${t}:** ${schTiers[t]}\n`;
    }
    pushDescriptionEmbeds(embeds, 'Save the World', desc);
  }

  if (embeds.length > 0) {
    embeds[embeds.length - 1]!.setFooter({ text: `Account: ${d.accountId}` }).setTimestamp();
  }

  return embeds;
}
