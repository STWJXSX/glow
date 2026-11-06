/**
 * Web checker report — same data/images as Discord /checker, JSON output.
 */

import axios from 'axios';
import { composeMCP } from '../helpers/epic/utils/mcp.ts';
import { getLauncherToken } from '../helpers/epic/auth/tokenRefresh.ts';
import { Endpoints } from '../helpers/core/endpoints.ts';
import { log } from '../helpers/core/logger.ts';
import {
  type CheckerImageConfig,
  type CheckerImageKey,
  mergeCheckerImageConfig,
} from '../helpers/epic/checker/checkerImageConfig.ts';
import { generateCheckerImages, generateSingleCheckerImage } from '../helpers/epic/checker/checkerImages.ts';
import type { SupportedLanguage } from '../helpers/locales/languages.ts';
import { isExclusiveCosmeticId } from '../managers/images/br/locker/lockerProfileParser.ts';
import { resolveFounderEdition, resolveFounderEditionFromQuests } from '../managers/images/stw/resources/resourcesParser.ts';
import type { CheckerAdvancedSettings } from './checkerProfileCache.ts';
import { storeCheckerRun, getCheckerRun, type CachedCheckerRun } from './checkerProfileCache.ts';
import {
  deriveFortniteSanctionFlags,
  fetchEosActiveSanctionActions,
  fetchFortniteLightswitchStatus,
} from '../helpers/epic/account/fortniteSanctions.ts';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
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

function buildTransactionsJson(commonStats: any, accountId: string): string {
  const purchases: any[] = commonStats.mtx_purchase_history?.purchases ?? [];
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

function countStwCollections(campaignItems: Record<string, any>) {
  const items = Object.values(campaignItems || {});
  return {
    heroes: items.filter((i: any) => i.templateId?.startsWith('Hero:')).length,
    survivors: items.filter((i: any) => i.templateId?.startsWith('Worker:')).length,
    defenders: items.filter((i: any) => i.templateId?.startsWith('Defender:')).length,
    schematics: items.filter((i: any) => i.templateId?.startsWith('Schematic:')).length,
  };
}

function formatDeviceAuthRow(a: any): [string, string, string] {
  const loc = a.created?.location || a.lastAccess?.location || '';
  const ip = a.created?.ipAddress || a.lastAccess?.ipAddress || '';
  const maskedIp = ip ? `${ip.split('.').slice(0, 2).join('.')}.***.***` : '—';
  const ua = a.userAgent || '';
  const shortUa = ua.length > 48 ? `${ua.substring(0, 45)}...` : ua;
  const device = shortUa || loc || '—';
  return [device, fmtDate(a.created?.dateTime), maskedIp];
}

function buildWebSections(data: any) {
  const a = data.athenaStats;
  const cc = data.commonStats;
  const cs = data.campaignStats;
  const mtxH = cc.mtx_purchase_history || {};
  const purch: any[] = mtxH.purchases || [];
  const vbSpent = purch.reduce((s: number, p: any) => s + (p.totalMtxPaid || 0), 0);
  const giftH = cc.gift_history || {};

  return [
    {
      id: 'account',
      title: 'Account Information',
      fields: [
        { label: 'Account ID', value: data.accountId },
        { label: 'Email', value: data.email || '—' },
        { label: 'Email Verified', value: yesNo(data.emailVerified) },
        { label: 'Display Name', value: data.displayName || '—' },
        { label: 'Full Name', value: data.fullName || '—' },
        { label: '2FA Enabled', value: yesNo(data.twoFactor) },
        { label: 'Last Login', value: fmtDate(data.lastLogin) },
        { label: 'Can Update Display Name', value: yesNo(data.canUpdateDisplayName) },
        { label: 'Total Name Changes', value: String(data.numberOfDisplayNameChanges ?? 'N/A') },
      ],
    },
    {
      id: 'bans',
      title: 'Ban & Restriction Info',
      fields: [
        { label: 'Never Sanctioned', value: yesNo(!data.activeSanctions) },
        { label: 'FN Entitlement access', value: yesNo(!data.fnEntitlementBan) },
        { label: 'Epic Social access', value: yesNo(!data.epicSocialBan) },
        { label: 'FN Matchmaking access', value: yesNo(!data.fnMatchmakingBan) },
      ],
    },
    {
      id: 'stats',
      title: 'Account Statistics',
      fields: [
        { label: 'Account Level', value: numFmt(a.accountLevel) },
        { label: '2FA Reward Claimed', value: yesNo(a.mfa_reward_claimed) },
        { label: 'Lifetime Wins (BR)', value: numFmt(a.lifetime_wins) },
        { label: 'Total Matches (BR)', value: data.totalMatchesBR != null ? numFmt(data.totalMatchesBR) : 'Unavailable' },
        { label: 'Last BR Match', value: `${fmtDate(a.last_match_end_datetime)} (${daysAgo(a.last_match_end_datetime)})` },
        { label: 'Last STW Match', value: `${fmtDate(a.last_stw_match_end_datetime)} (${daysAgo(a.last_stw_match_end_datetime)})` },
        { label: 'Season XP', value: numFmt(a.xp) },
        { label: 'Cumulative XP', value: numFmt(a.rested_xp_consumed_cumulative) },
      ],
    },
    {
      id: 'season',
      title: 'Current Season',
      fields: [
        { label: 'Season Number', value: String(a.season_num ?? 'N/A') },
        { label: 'Season Level', value: String(a.level ?? 0) },
        { label: 'Battle Pass Level', value: String(a.book_level ?? 0) },
        { label: 'Battle Pass XP', value: numFmt(a.book_xp) },
      ],
      table: {
        headers: ['Season', 'Level', 'BP Level', 'Wins', 'BP Purchased'],
        rows: [...(a.past_seasons || [])]
          .sort((x: any, y: any) => x.seasonNumber - y.seasonNumber)
          .map((s: any) => [
            String(s.seasonNumber),
            String(s.seasonLevel ?? 0),
            String(s.bookLevel ?? 0),
            String(s.numWins ?? 0),
            yesNo(s.purchasedVIP),
          ]),
      },
    },
    {
      id: 'vbucks',
      title: 'V-Bucks & Purchases',
      fields: [
        { label: 'V-Bucks Available', value: `${numFmt(data.vbucksAvailable)} VB` },
        { label: 'V-Bucks Spent (log)', value: `${numFmt(vbSpent)} VB` },
        { label: 'Refund Credits', value: `${Math.max(0, 3 - (mtxH.refundsUsed || 0))} / 3` },
        { label: 'Creator Code', value: cc.mtx_affiliate || 'None' },
        { label: 'Can Send Gifts', value: yesNo(cc.allowed_to_send_gifts) },
        { label: 'Gifts Sent', value: numFmt(giftH.num_sent) },
        { label: 'Gifts Received', value: numFmt(giftH.num_received) },
      ],
      table: {
        headers: ['Date', 'Item', 'VB', 'Status'],
        rows: [...purch]
          .sort((x: any, y: any) => new Date(y.purchaseDate).getTime() - new Date(x.purchaseDate).getTime())
          .slice(0, 10)
          .map((p: any) => [
            fmtDate(p.purchaseDate),
            p.lootResult?.[0]?.itemType?.split(':')[1] ?? 'Unknown',
            numFmt(p.totalMtxPaid),
            p.refundDate ? 'Refunded' : '—',
          ]),
      },
    },
    {
      id: 'locker',
      title: 'Locker Stats',
      fields: [
        {
          label: 'Total Locker Items',
          value: numFmt(Object.values(data.locker).reduce((s: number, v: any) => s + v, 0)),
        },
      ],
      table: {
        headers: ['Category', 'Count'],
        rows: Object.entries(data.locker).map(([cat, count]) => [cat, numFmt(count)]),
      },
    },
    {
      id: 'connected',
      title: 'Connected Accounts',
      table: {
        headers: ['Platform', 'Name'],
        rows: (data.externalAuths || []).map((auth: any) => [
          auth.type || auth.externalAuthType || '—',
          auth.externalDisplayName || auth.externalAuthId || '—',
        ]),
      },
    },
    {
      id: 'stw',
      title: 'Save the World',
      fields: [
        { label: 'STW Founder', value: data.founderEdition || '—' },
        { label: 'STW Level', value: numFmt(cs.level ?? 0) },
        { label: 'Zones Completed', value: numFmt(data.stw_zones_completed) },
        { label: 'Heroes', value: numFmt(data.stwCounts?.heroes ?? 0) },
        { label: 'Survivors', value: numFmt(data.stwCounts?.survivors ?? 0) },
        { label: 'Defenders', value: numFmt(data.stwCounts?.defenders ?? 0) },
        { label: 'Schematics', value: numFmt(data.stwCounts?.schematics ?? 0) },
      ],
    },
    {
      id: 'deviceAuths',
      title: 'Device Auths',
      table: {
        headers: ['Device', 'Created', 'IP'],
        rows: (data.deviceAuths || []).slice(0, 15).map(formatDeviceAuthRow),
      },
    },
  ];
}

function countExclusiveItems(items: Record<string, any>): number {
  let n = 0;
  for (const item of Object.values(items || {})) {
    const cid = (item.templateId?.split(':')[1] || '').toLowerCase();
    if (cid && isExclusiveCosmeticId(cid)) n++;
  }
  return n;
}

async function fetchAndBuildCheckerData(input: {
  accessToken: string;
  accountId: string;
  displayName: string;
  lang?: SupportedLanguage;
}) {
  const { accessToken, accountId, displayName } = input;

  const [athenaData, commonData, campaignData, accountInfo, externalAuths, theaterData, outpostData, lightswitchStatus, eosSanctionActions] = await Promise.all([
    composeMCP({ profile: 'athena', operation: 'QueryProfile', accountId, accessToken }),
    composeMCP({ profile: 'common_core', operation: 'QueryProfile', accountId, accessToken }),
    composeMCP({ profile: 'campaign', operation: 'QueryProfile', accountId, accessToken }),
    axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${accountId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    }).then(r => r.data),
    axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${accountId}/externalAuths`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    }).then(r => r.data).catch(() => []),
    composeMCP({ profile: 'theater0', operation: 'QueryProfile', accountId, accessToken }).catch(() => null),
    composeMCP({ profile: 'outpost0', operation: 'QueryProfile', accountId, accessToken }).catch(() => null),
    fetchFortniteLightswitchStatus(accessToken).catch(() => null),
    fetchEosActiveSanctionActions(accessToken, accountId),
  ]);

  const athena = athenaData?.profileChanges?.[0]?.profile;
  const common = commonData?.profileChanges?.[0]?.profile;
  const campaign = campaignData?.profileChanges?.[0]?.profile;

  if (!athena || !common || !campaign) {
    throw new Error('PROFILE_UNAVAILABLE');
  }

  const storage = outpostData?.profileChanges?.[0]?.profile ?? null;

  let vbucksAvailable = 0;
  for (const item of Object.values(common.items as Record<string, any>)) {
    if (item.templateId.startsWith('Currency:Mtx')) vbucksAvailable += item.quantity || 0;
  }

  const gStats: any[] = campaign.stats.attributes.gameplay_stats || [];
  const stw_zones_completed = gStats.find((s: any) => s.statName === 'zonescompleted')?.statValue ?? 0;

  let totalMatchesBR: number | null = null;
  try {
    const statsData = await axios.get(
      `${Endpoints.BR_STATS_V2}/account/${accountId}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 },
    );
    const s: Record<string, number> = statsData.data.stats || {};
    totalMatchesBR = Object.entries(s)
      .filter(([k]) => k.includes('br_') && k.includes('matchesplayed'))
      .reduce((acc, [, v]) => acc + v, 0);
  } catch {
    // optional
  }

  const sanctions = deriveFortniteSanctionFlags(
    common.stats.attributes as Record<string, unknown>,
    lightswitchStatus,
    eosSanctionActions,
  );

  const data = {
    accountId,
    email: accountInfo.email,
    displayName: accountInfo.displayName || displayName,
    fullName: accountInfo.name ? `${accountInfo.name} ${accountInfo.lastName || ''}`.trim() : '—',
    emailVerified: accountInfo.emailVerified,
    twoFactor: accountInfo.tfaEnabled,
    lastLogin: accountInfo.lastLogin,
    canUpdateDisplayName: accountInfo.canUpdateDisplayName,
    numberOfDisplayNameChanges: accountInfo.numberOfDisplayNameChanges,
    ...sanctions,
    athenaStats: athena.stats.attributes,
    athenaItems: athena.items || {},
    commonStats: common.stats.attributes,
    commonItems: common.items || {},
    campaignStats: campaign.stats.attributes,
    campaignItems: campaign.items || {},
    externalAuths: Array.isArray(externalAuths) ? externalAuths : [],
    vbucksAvailable,
    totalMatchesBR,
    locker: countLocker(athena.items || {}),
    stw_zones_completed,
    stwCounts: countStwCollections(campaign.items || {}),
    founderEdition: '—',
    deviceAuths: [] as any[],
    exclusiveCount: countExclusiveItems(athena.items || {}),
  };

  try {
    const launcherToken = await getLauncherToken(accessToken);
    if (launcherToken) {
      const daRes = await axios.get(
        `${Endpoints.ACCOUNT_DEVICEAUTH_LIST}/${accountId}/deviceAuth`,
        { headers: { Authorization: `Bearer ${launcherToken}` }, timeout: 10000 },
      );
      data.deviceAuths = daRes.data || [];
    }
  } catch {
    // non-critical
  }

  try {
    data.founderEdition = await resolveFounderEdition(
      campaign.items || {},
      accountId,
      accessToken,
    );
  } catch {
    data.founderEdition = resolveFounderEditionFromQuests(campaign.items || {}) ?? 'No Founder Pack';
  }

  return {
    athenaData,
    campaignData,
    theaterData,
    outpostData,
    campaignProfile: campaign as Record<string, unknown>,
    outpostProfile: storage as Record<string, unknown> | null,
    data,
  };
}

export interface CheckerWebTextResult {
  accountId: string;
  displayName: string;
  generatedAt: string;
  hasExclusives: boolean;
  exclusiveCount: number;
  sections: ReturnType<typeof buildWebSections>;
  transactions: unknown;
  markdown: string;
  runToken: string;
}

export interface CheckerWebReportInput {
  accessToken: string;
  accountId: string;
  displayName: string;
  imageConfig?: Partial<CheckerImageConfig> | null;
  advancedSettings?: CheckerAdvancedSettings | null;
  lang?: SupportedLanguage;
}

export interface CheckerWebImageChunk {
  key: string;
  label: string;
  pages: Array<{ fileName: string; mime: string; base64: string }>;
}

export interface CheckerWebReportResult {
  accountId: string;
  displayName: string;
  generatedAt: string;
  hasExclusives: boolean;
  exclusiveCount: number;
  sections: ReturnType<typeof buildWebSections>;
  transactions: unknown;
  markdown: string;
  images: CheckerWebImageChunk[];
}

function buildMarkdownFromSections(sections: ReturnType<typeof buildWebSections>, meta: {
  accountId: string;
  displayName: string;
  generatedAt: string;
}): string {
  const lines: string[] = [
    '# Fortnite Account Report',
    `*Generated: ${meta.generatedAt}*`,
    '',
    `**Account:** ${meta.displayName} (\`${meta.accountId}\`)`,
    '',
  ];
  for (const section of sections) {
    lines.push(`## ${section.title}`, '');
    for (const field of section.fields || []) {
      lines.push(`- **${field.label}:** ${field.value}`);
    }
    if (section.table?.rows?.length) {
      lines.push('');
      lines.push(`| ${section.table.headers.join(' | ')} |`);
      lines.push(`| ${section.table.headers.map(() => '---').join(' | ')} |`);
      for (const row of section.table.rows) {
        lines.push(`| ${row.join(' | ')} |`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function runCheckerWebTextReport(input: CheckerWebReportInput): Promise<CheckerWebTextResult> {
  const {
    accessToken,
    accountId,
    displayName,
    imageConfig,
    advancedSettings,
    lang = 'en',
  } = input;

  const config = mergeCheckerImageConfig(imageConfig);
  const built = await fetchAndBuildCheckerData({ accessToken, accountId, displayName, lang });
  const sections = buildWebSections(built.data);
  const txJson = buildTransactionsJson(built.data.commonStats, accountId);
  const generatedAt = new Date().toISOString();
  const hasExclusives = (built.data.exclusiveCount as number) > 0;

  const runToken = storeCheckerRun({
    accountId,
    displayName: built.data.displayName as string,
    accessToken,
    lang,
    imageConfig: config,
    advancedSettings: advancedSettings ?? {},
    athenaData: built.athenaData,
    campaignData: built.campaignData,
    theaterData: built.theaterData,
    outpostData: built.outpostData,
    campaignProfile: built.campaignProfile,
    outpostProfile: built.outpostProfile,
    data: built.data,
  });

  log.commands.info({ accountId }, '[checker-web] Text report ready');

  return {
    accountId,
    displayName: built.data.displayName as string,
    generatedAt,
    hasExclusives,
    exclusiveCount: built.data.exclusiveCount as number,
    sections,
    transactions: JSON.parse(txJson),
    markdown: buildMarkdownFromSections(sections, {
      accountId,
      displayName: built.data.displayName as string,
      generatedAt,
    }),
    runToken,
  };
}

export async function generateCheckerWebImagesFromRun(
  run: CachedCheckerRun,
): Promise<CheckerWebImageChunk[]> {
  const branding = {
    siteUrl: run.advancedSettings.branding?.siteUrl,
    footerIconUrl: run.advancedSettings.branding?.footerIconUrl,
  };

  const checkerImages = await generateCheckerImages({
    config: run.imageConfig,
    lang: run.lang,
    accessToken: run.accessToken,
    accountId: run.accountId,
    displayName: run.displayName,
    discordUserId: 'web-checker',
    athenaProfileBody: run.athenaData,
    campaignProfile: run.campaignProfile,
    campaignProfileBody: run.campaignData,
    theaterProfileBody: run.theaterData,
    outpostProfile: run.outpostProfile,
    outpostProfileBody: run.outpostData,
    imageBranding: branding,
    advancedSettings: run.advancedSettings,
  });

  return checkerImages.map(img => ({
    key: img.key,
    label: img.label,
    pages: img.buffers.map(page => ({
      fileName: page.fileName,
      mime: 'image/webp',
      base64: page.buffer.toString('base64'),
    })),
  }));
}

/** Yields each image group as soon as it is ready (parallel generation). */
export async function* streamCheckerWebImagesFromRun(
  run: CachedCheckerRun,
): AsyncGenerator<CheckerWebImageChunk> {
  const keys = (Object.keys(run.imageConfig) as Array<keyof typeof run.imageConfig>)
    .filter((k) => run.imageConfig[k] !== false);

  const branding = {
    siteUrl: run.advancedSettings.branding?.siteUrl,
    footerIconUrl: run.advancedSettings.branding?.footerIconUrl,
  };

  const baseInput = {
    config: run.imageConfig,
    lang: run.lang,
    accessToken: run.accessToken,
    accountId: run.accountId,
    displayName: run.displayName,
    discordUserId: 'web-checker',
    athenaProfileBody: run.athenaData,
    campaignProfile: run.campaignProfile,
    campaignProfileBody: run.campaignData,
    theaterProfileBody: run.theaterData,
    outpostProfile: run.outpostProfile,
    outpostProfileBody: run.outpostData,
    imageBranding: branding,
    advancedSettings: run.advancedSettings,
  };

  const tasks = keys.map((key) => generateSingleCheckerImage(key, baseInput).then((result) => ({ key, result })));
  const pending = new Set(tasks);

  while (pending.size > 0) {
    const { result } = await Promise.race(
      [...pending].map((p) => p.then((value) => {
        pending.delete(p);
        return value;
      })),
    );
    if (result) {
      yield {
        key: result.key,
        label: result.label,
        pages: result.buffers.map(page => ({
          fileName: page.fileName,
          mime: 'image/webp',
          base64: page.buffer.toString('base64'),
        })),
      };
    }
  }
}

export async function generateSingleCheckerImageForRun(
  run: CachedCheckerRun,
  key: CheckerImageKey,
): Promise<CheckerWebImageChunk | null> {
  if (run.imageConfig[key] === false) return null;
  const branding = {
    siteUrl: run.advancedSettings.branding?.siteUrl,
    footerIconUrl: run.advancedSettings.branding?.footerIconUrl,
  };
  const result = await generateSingleCheckerImage(key, {
    config: run.imageConfig,
    lang: run.lang,
    accessToken: run.accessToken,
    accountId: run.accountId,
    displayName: run.displayName,
    discordUserId: 'web-checker',
    athenaProfileBody: run.athenaData,
    campaignProfile: run.campaignProfile,
    campaignProfileBody: run.campaignData,
    theaterProfileBody: run.theaterData,
    outpostProfile: run.outpostProfile,
    outpostProfileBody: run.outpostData,
    imageBranding: branding,
    advancedSettings: run.advancedSettings,
  });
  if (!result) return null;
  return {
    key: result.key,
    label: result.label,
    pages: result.buffers.map(page => ({
      fileName: page.fileName,
      mime: 'image/webp',
      base64: page.buffer.toString('base64'),
    })),
  };
}

export async function runCheckerWebReport(input: CheckerWebReportInput): Promise<CheckerWebReportResult> {
  const text = await runCheckerWebTextReport(input);
  const cached = getCheckerRun(text.runToken);
  const images = cached ? await generateCheckerWebImagesFromRun(cached) : [];

  log.commands.info({ accountId: text.accountId }, '[checker-web] Full report generated');

  return {
    accountId: text.accountId,
    displayName: text.displayName,
    generatedAt: text.generatedAt,
    hasExclusives: text.hasExclusives,
    exclusiveCount: text.exclusiveCount,
    sections: text.sections,
    transactions: text.transactions,
    markdown: text.markdown,
    images,
  };
}
