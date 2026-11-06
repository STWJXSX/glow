/**
 * COMANDO /OUTPOST
 * Subcomandos:
 *  - status → imagen con nivel escudo + endurance (estilo /resources)
 *  - permissions → permisos de edición por zona del Escudo Antitormentas
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  type Client,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { getAppEmojiByName } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import {
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  getEpicAuthor,
  epicSection,
  epicQuote,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_NAV_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import {
  generateStwOutpostImage,
  STW_OUTPOST_FILE_NAME,
} from '#managers/images/stw/outpost/index.ts';
import type { StwStormShieldZone } from '#managers/images/stw/resources/types.ts';

// ── Types ────────────────────────────────────────────────────

interface ZonePermission {
  accountId: string;
  displayName: string;
}

interface OutpostZone {
  zoneId: string;
  zoneName: string;
  level: number;
  permissions: ZonePermission[];
}

// ── Zone config ──────────────────────────────────────────────

const ZONE_IDS = [
  'outpostcore_pve_01',
  'outpostcore_pve_02',
  'outpostcore_pve_03',
  'outpostcore_pve_04',
];

const ZONE_LABEL_KEYS: Record<string, StwStormShieldZone['key']> = {
  outpostcore_pve_01: 'stonewood',
  outpostcore_pve_02: 'plankerton',
  outpostcore_pve_03: 'canny',
  outpostcore_pve_04: 'twine',
};

const ZONE_EMOJI_NAMES: Record<string, string> = {
  outpostcore_pve_01: 'difficulties_stonewood',
  outpostcore_pve_02: 'difficulties_plankerton',
  outpostcore_pve_03: 'difficulties_canny',
  outpostcore_pve_04: 'difficulties_twine',
};

const PLAYERS_PER_PAGE = 10;

function getZoneEmoji(client: Client, zoneId: string): string {
  return getAppEmojiByName(client, ZONE_EMOJI_NAMES[zoneId] ?? 'difficulties_stonewood');
}

/** Resolve account IDs → display names in batches of 100 */
async function resolveDisplayNames(
  accountIds: string[],
  accessToken: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(accountIds)];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const params = chunk.map(id => `accountId=${id}`).join('&');
    try {
      const { data } = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      for (const acc of Array.isArray(data) ? data : [data]) {
        if (acc.id && acc.displayName) map.set(acc.id, acc.displayName);
      }
    } catch {}
  }
  return map;
}

/** Parse outpost zones from metadata profile items */
function parseOutpostZones(
  items: Record<string, any>,
): { zoneId: string; level: number; permissionIds: string[] }[] {
  const zones: { zoneId: string; level: number; permissionIds: string[] }[] = [];

  for (const [, item] of Object.entries(items)) {
    const tid: string = item.templateId || '';
    const match = tid.match(/^Outpost:(.+)$/);
    if (!match) continue;
    const zoneKey = match[1];
    if (!ZONE_IDS.includes(zoneKey)) continue;

    const attrs = item.attributes || {};
    const coreInfo = attrs.outpost_core_info ?? {};
    const level = attrs.level ?? 0;
    const permissionIds: string[] = coreInfo.accountsWithEditPermission ?? [];
    zones.push({ zoneId: zoneKey, level, permissionIds });
  }

  zones.sort((a, b) => ZONE_IDS.indexOf(a.zoneId) - ZONE_IDS.indexOf(b.zoneId));
  return zones;
}

async function resolveZoneLabels(
  userId: string,
  locale: string | null,
): Promise<Partial<Record<StwStormShieldZone['key'], string>>> {
  const entries = await Promise.all(
    ZONE_IDS.map(async (zoneId) => {
      const key = ZONE_LABEL_KEYS[zoneId];
      const label = await translateForUser(userId, `outpost.zones.${zoneId}`, undefined, locale);
      return [key, label] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function handleOutpostStatus(
  interaction: ChatInputCommandInteraction,
  userId: string,
  mainAccount: { accountId: string; accessToken: string; displayName: string },
  locale: string | null,
) {
  const authorData = await getEpicAuthor(userId, {
    accountId: mainAccount.accountId,
    accessToken: mainAccount.accessToken,
    displayName: mainAccount.displayName,
  });
  const title = await translateForUser(userId, 'outpost.statusTitle', undefined, locale);

  let campaignProfile: Record<string, unknown>;
  try {
    const result = await composeMCP({
      profile: 'campaign',
      operation: 'QueryProfile',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
    });

    const profileData = result.data ?? result;
    campaignProfile = profileData?.profileChanges?.[0]?.profile ?? {};
    if (!campaignProfile?.items) {
      throw new Error('Campaign profile missing items');
    }
  } catch (err: unknown) {
    log.commands.error({ err }, '[outpost status] Failed to fetch campaign profile');
    await replyEpicApiError(interaction, userId, err);
    return;
  }

  const zoneLabels = await resolveZoneLabels(userId, locale);
  const imageResult = await generateStwOutpostImage({
    campaignProfile,
    displayName: mainAccount.displayName,
    zoneLabels,
  });

  const attachment = new AttachmentBuilder(imageResult.buffer, {
    name: STW_OUTPOST_FILE_NAME,
  });

  const payload = await buildEpicReplyPayload(userId, {
    style: 'info',
    title,
    description: epicQuote(mainAccount.displayName),
    author: authorData,
    image: `attachment://${STW_OUTPOST_FILE_NAME}`,
    footerKey: 'brand',
  }, interaction, locale);

  await interaction.editReply({
    ...payload,
    files: [...(payload.files ?? []), attachment],
  });
}

async function handleOutpostPermissions(
  interaction: ChatInputCommandInteraction,
  userId: string,
  client: Client,
  mainAccount: { accountId: string; accessToken: string; displayName: string },
  locale: string | null,
) {
  const zoneNames = Object.fromEntries(
    await Promise.all(
      ZONE_IDS.map(async (zoneId) => [
        zoneId,
        await translateForUser(userId, `outpost.zones.${zoneId}`, undefined, locale),
      ]),
    ),
  );

  const authorData = await getEpicAuthor(userId, {
    accountId: mainAccount.accountId,
    accessToken: mainAccount.accessToken,
    displayName: mainAccount.displayName,
  });

  const title = await translateForUser(userId, 'outpost.title', undefined, locale);

  let allZones: OutpostZone[];
  try {
    const result = await composeMCP({
      profile: 'metadata',
      operation: 'QueryProfile',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
    });

    const profileData = result.data ?? result;
    const items = profileData?.profileChanges?.[0]?.profile?.items ?? {};
    const rawZones = parseOutpostZones(items);

    const allAccountIds = rawZones.flatMap(z => z.permissionIds);
    const nameMap = allAccountIds.length > 0
      ? await resolveDisplayNames(allAccountIds, mainAccount.accessToken)
      : new Map<string, string>();

    allZones = rawZones.map(z => ({
      zoneId: z.zoneId,
      zoneName: zoneNames[z.zoneId] || z.zoneId,
      level: z.level,
      permissions: z.permissionIds.map(id => ({
        accountId: id,
        displayName: nameMap.get(id) ?? id,
      })),
    }));
  } catch (err: unknown) {
    log.commands.error({ err }, '[outpost permissions] Failed to fetch outpost data');
    await replyEpicApiError(interaction, userId, err);
    return;
  }

  if (allZones.length === 0) {
    const noZones = await translateForUser(userId, 'outpost.noZones', undefined, locale);
    await replyWithEpicEmbed(interaction, userId, {
      style: 'info',
      title,
      description: `${epicQuote(mainAccount.displayName)}\n\n${noZones}`,
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
    return;
  }

  let activeZoneIdx = 0;
  let currentPage = 1;

  async function buildReply() {
    const zone = allZones[activeZoneIdx];
    const totalPerms = zone.permissions.length;
    const totalPages = Math.max(1, Math.ceil(totalPerms / PLAYERS_PER_PAGE));
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    const start = (currentPage - 1) * PLAYERS_PER_PAGE;
    const pagePerms = zone.permissions.slice(start, start + PLAYERS_PER_PAGE);

    const levelLabel = await translateForUser(userId, 'outpost.level', undefined, locale);
    const permissionsLabel = await translateForUser(userId, 'outpost.permissions', undefined, locale);
    const playersLabel = await translateForUser(userId, 'outpost.players', undefined, locale);
    const noPermissions = await translateForUser(userId, 'outpost.noPermissions', undefined, locale);
    const prevLabel = await translateForUser(userId, 'outpost.prev', undefined, locale);
    const nextLabel = await translateForUser(userId, 'outpost.next', undefined, locale);
    const selectZone = await translateForUser(userId, 'outpost.selectZone', undefined, locale);

    const zoneEmoji = getZoneEmoji(client, zone.zoneId);
    const pageText = totalPages > 1
      ? ` · ${await translateForUser(userId, 'outpost.page', {
        page: String(currentPage),
        total: String(totalPages),
      }, locale)}`
      : '';

    const lines: string[] = [
      epicQuote(mainAccount.displayName),
      '',
      `${zoneEmoji} **${zone.zoneName}** — ${levelLabel} ${zone.level}`,
      epicQuote(`${permissionsLabel} · ${totalPerms} ${playersLabel}${pageText}`),
    ];

    if (totalPerms === 0) {
      lines.push('', noPermissions);
    } else {
      lines.push('', epicSection(permissionsLabel));
      for (let i = 0; i < pagePerms.length; i++) {
        const perm = pagePerms[i];
        const globalIdx = start + i + 1;
        lines.push(`**${globalIdx}.** ${perm.displayName}`);
        lines.push(epicQuote(`\`${perm.accountId}\``));
      }
    }

    const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    if (totalPages > 1) {
      const navRow = new ActionRowBuilder<ButtonBuilder>();
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId('outpost_prev')
          .setLabel(prevLabel)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage <= 1),
        new ButtonBuilder()
          .setCustomId('outpost_next')
          .setLabel(nextLabel)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage >= totalPages),
      );
      components.push(navRow);
    }

    if (allZones.length > 1) {
      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>();
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('outpost_zone')
        .setPlaceholder(selectZone);

      for (let i = 0; i < allZones.length; i++) {
        const z = allZones[i];
        selectMenu.addOptions({
          label: `${z.zoneName} — ${levelLabel} ${z.level} (${z.permissions.length} ${playersLabel})`,
          value: String(i),
          default: i === activeZoneIdx,
        });
      }

      selectRow.addComponents(selectMenu);
      components.push(selectRow);
    }

    const payload = await buildEpicReplyPayload(userId, {
      style: 'info',
      title,
      description: lines.join('\n'),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    }, interaction, locale);

    return { ...payload, components };
  }

  const initialPayload = await buildReply();
  await interaction.editReply(initialPayload);

  const reply = await interaction.fetchReply();
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    idle: EPIC_NAV_IDLE_MS,
  });

  collector.on('collect', async (btn) => {
    const cid = btn.customId;
    await btn.deferUpdate();

    if (cid === 'outpost_zone' && btn.isStringSelectMenu()) {
      activeZoneIdx = parseInt(btn.values[0], 10) || 0;
      currentPage = 1;
    } else if (cid === 'outpost_prev') {
      currentPage--;
    } else if (cid === 'outpost_next') {
      currentPage++;
    } else {
      return;
    }

    try {
      await interaction.editReply(await buildReply());
    } catch {}
  });

  collector.on('end', async (_, reason) => {
    if (!isCollectorIdle(reason)) return;
    try {
      const inactive = await translateForUser(userId, 'epic.inactiveNav', undefined, locale);
      await editReplyInactive(interaction, inactive);
    } catch {}
  });
}

// ── Command ──────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('outpost')
    .setDescription('Manage your Storm Shield outposts')
    .setNameLocalizations(buildDiscordLocalizations('outpost.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('outpost.cmd._1'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('View Storm Shield level and Endurance progress as an image')
        .setNameLocalizations(buildDiscordLocalizations('outpost.cmd.status.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('outpost.cmd.status.description')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('permissions')
        .setDescription('View edit permissions for your Storm Shield zones')
        .setNameLocalizations(buildDiscordLocalizations('outpost.cmd.permissions.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('outpost.cmd._2')),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 10,
  prem: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const client = interaction.client;
    const locale = interaction.locale;
    const subcommand = interaction.options.getSubcommand(true);

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    if (subcommand === 'status') {
      await handleOutpostStatus(interaction, userId, mainAccount, locale);
      return;
    }

    await handleOutpostPermissions(interaction, userId, client, mainAccount, locale);
  },
};

export default command;
