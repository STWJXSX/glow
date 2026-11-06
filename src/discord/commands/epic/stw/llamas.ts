/**
 * COMANDO /LLAMAS
 * Muestra las llamas STW disponibles de la cuenta principal e incluye
 * botones «Abrir x10» y «Abrir Todas» por cada tipo.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder,
  type Client,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getAppEmojiByName } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, getUserLanguage, translateForUser } from '#helpers/locales/index.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildEpicReplyPayload,
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  getEpicAuthor,
  translateEpic,
  epicSection,
  epicQuote,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  generateStwLlamasImage,
  parseStwLlamaTiles,
  STW_LLAMAS_FILE_NAME,
} from '#managers/images/stw/llamas/index.ts';
import {
  EPIC_NAV_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import { guardBulkMode, addBulkOptionToCommand } from '#helpers/core/client/bulkAccess.ts';
import {
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
  prepareBulkAccounts,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkImagePaginated, type BulkImagePage } from '#helpers/core/bulkImagePaginator.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import {
  buildComponentsV2Payload,
  createComponentsV2Container,
} from '#helpers/core/embedHelper.ts';

// ── Name mappings ────────────────────────────────────────────

const enPath = resolve(process.cwd(), 'src/discord/helpers/data/maps/en-US.json');
const esPath = resolve(process.cwd(), 'src/discord/helpers/data/maps/es-ES.json');
let guiaEN: Record<string, string> = {};
let guiaES: Record<string, string> = {};
try { guiaEN = JSON.parse(readFileSync(enPath, 'utf-8')); } catch {}
try { guiaES = JSON.parse(readFileSync(esPath, 'utf-8')); } catch {}

// ── Types ────────────────────────────────────────────────────

interface LlamaEntry {
  templateId: string;
  name: string;
  quantity: number;
  itemIds: string[];
  type: 'voucher' | 'cardpack';
}

// ── Emoji mapping (templateId key → application emoji name) ──

const LLAMA_EMOJI_MAP: [RegExp, string][] = [
  [/voucher_basicpack/,                           'resources_voucher_basicpack'],
  [/voucher_cardpack_bronze/,                     'esources_voucher_cardpack_bronze'],
  [/voucher_cardpack_jackpot/,                    'sources_voucher_cardpack_jackpot'],
  [/voucher_cardpack_event_founders/,             'voucher_cardpack_event_founders'],
  [/voucher_cardpack_2021anniversary/,            'voucher_cardpack_2021anniversary'],
  [/voucher_cardpack_persistent_anniversary/,     'voucher_cardpack_2021anniversary'],
  [/cardpack_basic/,                              'llamas_pinataminirewardpack'],
  [/cardpack_bronze/,                             'llamas_pinatastandardpack'],
  [/cardpack_silver/,                             'llamas_pinatasilver'],
  [/cardpack_gold/,                               'llamas_pinatagold'],
  [/cardpack_jackpot/,                            'llamas_pinatagold'],
  [/cardpack_event_founders/,                     'llamas_pinatafounderspack'],
  [/cardpack_event.*halloween/,                   'llamas_pinatahalloweenpack'],
  [/cardpack_event.*winter/,                      'llamas_pinatawintereventpack'],
  [/cardpack_event.*anniversary/,                 'llamas_pinataanniversarypack_l'],
  [/cardpack_event.*spring/,                      'llamas_pinataspringeventpack'],
  [/cardpack_event.*pirate|yarr/,                 'llamas_pinatayarreventpack'],
  [/cardpack_event.*blockbuster/,                 'llamas_pinatablockbusterpack'],
  [/cardpack_event.*eighties/,                    'llamas_pinataeightiespack'],
  [/cardpack_event.*scavenger/,                   'llamas_pinatascavengerpack'],
  [/cardpack_event.*stormzone/,                   'llamas_pinatastormzonepack'],
  [/cardpack_event.*fleming/,                     'llamas_pinataflemingpack'],
  [/cardpack_event.*vindertech/,                  'llamas_pinatavindertechpack'],
  [/cardpack_event.*roadtrip|horde/,              'llamas_pinataroadtriphordepack'],
  [/cardpack_event.*neon|cyberpunk/,              'llamas_pinataneoncyberpunkpack'],
  [/cardpack_event.*retro|scifi/,                 'llamas_pinataretroscifieventpack'],
  [/cardpack_event.*artdeco/,                     'llamas_pinataartdecopack2020_512'],
];

function getLlamaEmoji(client: Client, templateId: string): string {
  const key = templateId.replace(/^AccountResource:/, '').replace(/^CardPack:/, '');
  for (const [re, emojiName] of LLAMA_EMOJI_MAP) {
    if (re.test(key)) return getAppEmojiByName(client, emojiName);
  }
  return getAppEmojiByName(client, 'llamas_pinatastandardpack');
}

function getLlamaName(templateId: string, lang: string): string {
  const guia = lang === 'es' ? guiaES : guiaEN;
  const name = guia[templateId];
  if (name) return name.replace(/\s+Token$/i, '');
  const key = templateId.replace(/^AccountResource:/, '').replace(/^CardPack:/, '');
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Core: fetch / open llamas (Epic logic lives in glow-core) ─

async function fetchLlamas(accountId: string, accessToken: string): Promise<{
  llamas: LlamaEntry[];
  profile: Record<string, unknown>;
}> {
  return callCoreWithTimeout<{ llamas: LlamaEntry[]; profile: Record<string, unknown> }>(
    'llamas.fetch',
    60_000,
    { accountId, accessToken },
  );
}

async function openCardPacks(
  accountId: string, accessToken: string, itemIds: string[],
): Promise<{ opened: number; error?: string }> {
  return callCoreWithTimeout<{ opened: number; error?: string }>('llamas.openCardPacks', 2 * 60_000, {
    accountId,
    accessToken,
    itemIds,
  });
}

async function openVouchers(
  accountId: string, accessToken: string, templateId: string, count: number,
): Promise<{ opened: number; error?: string }> {
  return callCoreWithTimeout<{ opened: number; error?: string }>('llamas.openVouchers', 5 * 60_000, {
    accountId,
    accessToken,
    templateId,
    count,
  });
}

// ── Bulk: llamas image per account ───────────────────────────

async function buildLlamasAttachmentsForAccount(
  profile: Record<string, unknown>,
  account: { accountId: string; accessToken: string; displayName: string },
  discordUserId: string,
): Promise<AttachmentBuilder[]> {
  if (!parseStwLlamaTiles(profile).length) return [];
  try {
    const imageResult = await generateStwLlamasImage({
      campaignProfile: profile,
      displayName: account.displayName,
      accessToken: account.accessToken,
      accountId: account.accountId,
      discordUserId,
    });
    return imageResult.pages.map((page) => new AttachmentBuilder(page.buffer, {
      name: page.fileName || STW_LLAMAS_FILE_NAME,
    }));
  } catch (err: unknown) {
    log.commands.warn({ err }, '[llamas] Bulk image generation failed');
    return [];
  }
}

async function handleBulkLlamas(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;

  const user = await UsuarioInfo.findOne({ id: userId });
  if (!user?.deviceAuths?.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  const userLanguage = await getUserLanguage(userId, locale);
  const langCode = userLanguage === 'es' ? 'es' : 'en';

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const loadingText = await translateForUser(userId, 'llamas.title', undefined, locale);
  await interaction.editReply(
    buildComponentsV2Payload(
      createComponentsV2Container({
        style: 'info',
        content: `${getEmoji(client, 'loading')} ${loadingText}…`,
      }),
    ) as any,
  );

  const imagePages: BulkImagePage[] = [];
  const llamaIcon = getAppEmojiByName(client, 'llamas_t_icon_storellamabg');
  const totalLabel = await translateForUser(userId, 'llamas.total', undefined, locale);

  for (const { account, ok, error } of readyAccounts) {
    const accountLabel = buildBulkAccountLabel(client, account.displayName, account.cuentaMain);

    if (!ok) {
      const field = await buildBulkAuthErrorField(client, userId, account, error, locale);
      imagePages.push({
        accountLabel: field.name,
        hint: field.value,
        attachments: [],
        style: 'error',
      });
      continue;
    }

    try {
      const { llamas, profile } = await fetchLlamas(account.accountId, account.accessToken);

      if (!llamas.length) {
        const noLlamas = await translateForUser(userId, 'llamas.noLlamas', undefined, locale);
        imagePages.push({ accountLabel, hint: noLlamas, attachments: [], style: 'info' });
        continue;
      }

      const totalCount = llamas.reduce((s, l) => s + l.quantity, 0);
      const lines: string[] = [
        `${llamaIcon} ${epicQuote(`${totalCount} ${totalLabel}`)}`,
      ];

      const maxLines = 15;
      for (let idx = 0; idx < Math.min(llamas.length, maxLines); idx++) {
        const entry = llamas[idx]!;
        const emoji = getLlamaEmoji(client, entry.templateId);
        const name = getLlamaName(entry.templateId, langCode);
        const qtyLabel = await translateForUser(
          userId, 'llamas.quantity', { qty: String(entry.quantity) }, locale,
        );
        lines.push(`${emoji} **${name}** — ${qtyLabel}`);
      }
      if (llamas.length > maxLines) {
        const moreLine = await translateForUser(
          userId,
          'llamas.bulk.moreTypes',
          { count: String(llamas.length - maxLines) },
          locale,
        );
        lines.push(moreLine);
      }

      const attachments = await buildLlamasAttachmentsForAccount(
        profile,
        {
          accountId: account.accountId,
          accessToken: account.accessToken,
          displayName: account.displayName,
        },
        userId,
      );

      imagePages.push({
        accountLabel,
        hint: lines.join('\n'),
        attachments,
        style: 'info',
      });
    } catch (err: unknown) {
      log.commands.error({ err }, '[llamas] Bulk fetch failed');
      const fetchError = await translateForUser(userId, 'llamas.fetchError', undefined, locale);
      imagePages.push({
        accountLabel,
        hint: epicSection(fetchError),
        attachments: [],
        style: 'error',
      });
    }
  }

  const title = await translateForUser(
    userId,
    'llamas.bulk.title',
    { count: String(readyAccounts.length) },
    locale,
  );
  const summary = await translateForUser(userId, 'llamas.bulk.summary', undefined, locale);

  if (!imagePages.length) {
    await replyEpicApiError(interaction, userId, new Error('No accounts'));
    return;
  }

  await sendBulkImagePaginated(interaction, title, summary, imagePages);
}

// ── Command ──────────────────────────────────────────────────

const command: Command = {
  data: addBulkOptionToCommand(
    new SlashCommandBuilder()
      .setName('llamas')
      .setDescription('View and open your STW llamas')
      .setNameLocalizations(buildDiscordLocalizations('llamas.cmd.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('llamas.cmd._1'))
      .setDMPermission(true),
    'llamas.bulk.optionDescription',
  ),

  auth: true,
  cooldown: 10,
  prem: true,

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getBoolean('bulk')) {
      if (!await guardBulkMode(interaction)) return;
      await handleBulkLlamas(interaction);
      return;
    }

    const userId = interaction.user.id;
    const client = interaction.client;
    const locale = interaction.locale;

    const lang = await getUserLanguage(userId, locale);

    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    let llamas: LlamaEntry[];
    let campaignProfile: Record<string, unknown>;
    try {
      const fetched = await fetchLlamas(mainAccount.accountId, mainAccount.accessToken);
      llamas = fetched.llamas;
      campaignProfile = fetched.profile;
    } catch (err: unknown) {
      log.commands.error({ err }, '[llamas] Failed to fetch llamas');
      await replyEpicApiError(interaction, userId, err);
      return;
    }

    const title = await translateForUser(userId, 'llamas.title', undefined, locale);
    const llamaIcon = getAppEmojiByName(client, 'llamas_t_icon_storellamabg');

    async function buildLlamasAttachments(profile: Record<string, unknown>): Promise<AttachmentBuilder[]> {
      if (!parseStwLlamaTiles(profile).length) return [];
      try {
        const imageResult = await generateStwLlamasImage({
          campaignProfile: profile,
          displayName: mainAccount!.displayName,
          accessToken: mainAccount!.accessToken,
          accountId: mainAccount!.accountId,
          discordUserId: userId,
        });
        return imageResult.pages.map((page) => new AttachmentBuilder(page.buffer, {
          name: page.fileName || STW_LLAMAS_FILE_NAME,
        }));
      } catch (err: unknown) {
        log.commands.warn({ err }, '[llamas] Image generation failed');
        return [];
      }
    }

    async function buildReply(
      statusLine?: string,
      style: 'info' | 'success' | 'error' = 'info',
      withButtons = true,
      profile: Record<string, unknown> = campaignProfile,
    ) {
      const totalCount = llamas.reduce((s, l) => s + l.quantity, 0);
      const totalLabel = await translateForUser(userId, 'llamas.total', undefined, locale);
      const lines: string[] = [
        `${llamaIcon} ${epicQuote(`${totalCount} ${totalLabel}`)}`,
      ];

      if (statusLine) {
        lines.push('', statusLine);
      }

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      const attachments = await buildLlamasAttachments(profile);

      if (withButtons && llamas.length > 0) {
        const showTextList = attachments.length === 0;

        if (showTextList) {
          lines.push('', epicSection(title));

          for (let idx = 0; idx < llamas.length; idx++) {
            const entry = llamas[idx];
            const emoji = getLlamaEmoji(client, entry.templateId);
            const name = getLlamaName(entry.templateId, lang);
            const qtyLabel = await translateForUser(
              userId, 'llamas.quantity', { qty: String(entry.quantity) }, locale,
            );
            lines.push(`${emoji} **${name}** — ${qtyLabel}`);
          }
        }

        for (let idx = 0; idx < llamas.length; idx++) {
          const entry = llamas[idx];
          const openCount = Math.min(entry.quantity, 10);
          const row = new ActionRowBuilder<ButtonBuilder>();
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`llama_x_${idx}_${openCount}`)
              .setLabel(await translateForUser(
                userId, 'llamas.openX', { count: String(openCount) }, locale,
              ))
              .setStyle(ButtonStyle.Primary),
          );

          if (entry.quantity > 1) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`llama_all_${idx}`)
                .setLabel(await translateForUser(
                  userId, 'llamas.openAll', { count: String(entry.quantity) }, locale,
                ))
                .setStyle(ButtonStyle.Success),
            );
          }

          rows.push(row);
        }
      }

      const basePayload = await buildEpicReplyPayload(userId, {
        style,
        title,
        description: lines.join('\n'),
        author: authorData,
        timestamp: true,
        footerKey: 'brand',
      }, interaction, locale);

      const embeds: EmbedBuilder[] = [];

      if (attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const file = attachments[i]!;
          const fileName = file.name ?? STW_LLAMAS_FILE_NAME;
          const embed = EmbedBuilder.from(basePayload.embeds?.[0] ?? new EmbedBuilder());
          embed
            .setDescription(i === 0 ? lines.join('\n') : '\u200b')
            .setImage(`attachment://${fileName}`);
          if (i > 0) embed.setAuthor(null).setFooter(null).setTimestamp(null);
          embeds.push(embed);
        }
      }

      return {
        ...basePayload,
        embeds: embeds.length ? embeds : basePayload.embeds,
        files: attachments,
        components: rows,
      };
    }

    if (llamas.length === 0) {
      const noLlamas = await translateForUser(userId, 'llamas.noLlamas', undefined, locale);
      await replyWithEpicEmbed(interaction, userId, {
        style: 'info',
        title,
        description: noLlamas,
        author: authorData,
        timestamp: true,
        footerKey: 'brand',
      });
      return;
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
      if (!cid.startsWith('llama_')) return;

      await btn.deferUpdate();

      let entry: LlamaEntry | undefined;
      let count: number;

      if (cid.startsWith('llama_all_')) {
        const idx = parseInt(cid.replace('llama_all_', ''), 10);
        entry = llamas[idx];
        count = entry?.quantity ?? 1;
      } else if (cid.startsWith('llama_x_')) {
        const parts = cid.replace('llama_x_', '').split('_');
        const idx = parseInt(parts[0], 10);
        count = parseInt(parts[1], 10);
        entry = llamas[idx];
      } else {
        return;
      }

      if (!entry) return;
      const templateId = entry.templateId;
      const name = getLlamaName(templateId, lang);

      const openingLine = await translateEpic(
        client, userId, 'llamas.opening', 'loading', { name }, locale,
      );
      try {
        const openingPayload = await buildEpicReplyPayload(userId, {
          loading: true,
          title,
          description: openingLine,
          author: authorData,
          footerKey: 'brand',
        }, interaction, locale);
        await interaction.editReply({ ...openingPayload, components: [] });
      } catch {}

      let result: { opened: number; error?: string };
      try {
        if (entry.type === 'cardpack') {
          const ids = entry.itemIds.slice(0, count);
          result = await openCardPacks(mainAccount!.accountId, mainAccount!.accessToken, ids);
        } else {
          result = await openVouchers(mainAccount!.accountId, mainAccount!.accessToken, templateId, count);
        }
      } catch (err: any) {
        result = { opened: 0, error: err.message || 'Unexpected error' };
      }

      try {
        const fetched = await fetchLlamas(mainAccount!.accountId, mainAccount!.accessToken);
        llamas = fetched.llamas;
        campaignProfile = fetched.profile;
      } catch { /* keep old list if refresh fails */ }

      let statusLine: string;
      if (result.error) {
        const partial = result.opened > 0
          ? ` (${await translateForUser(userId, 'llamas.opened', { count: String(result.opened), name }, locale)})`
          : '';
        statusLine = await translateEpic(
          client, userId, 'llamas.errorOpen', 'error', { error: result.error }, locale,
        ) + partial;
      } else {
        statusLine = await translateEpic(
          client, userId, 'llamas.opened', 'success',
          { count: String(result.opened), name }, locale,
        );
      }

      if (llamas.length === 0) {
        const noLlamas = await translateForUser(userId, 'llamas.noLlamas', undefined, locale);
        await replyWithEpicEmbed(interaction, userId, {
          style: 'success',
          title,
          description: [statusLine, '', noLlamas].join('\n'),
          author: authorData,
          timestamp: true,
          footerKey: 'brand',
        });
        collector.stop('done');
        return;
      }

      try {
        const updatedPayload = await buildReply(statusLine, result.error ? 'error' : 'success', true, campaignProfile);
        await interaction.editReply(updatedPayload);
      } catch {}
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      try {
        const inactive = await translateForUser(userId, 'epic.inactiveNav', undefined, locale);
        await editReplyInactive(interaction, inactive);
      } catch {}
    });
  },
};

export default command;
