/**
 * Persistent buttons on community loadout posts (like / dislike / clone).
 */

import {
  Events,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { getUserLanguage, translate } from '#helpers/locales/index.ts';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import {
  parseLoPubCustomId,
  buildCommunityV2Container,
  buildCloneSlotRows,
  communityImageUrlFromMessage,
  COMMUNITY_CHANNEL_LANG,
} from '#helpers/epic/stw/loadouts/loadoutsCommunityEmbed.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import type {
  CloneLoadoutResult,
  StwLoadoutSlot,
} from '#managers/epic/stw/stwLoadoutShared.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import CommunityLoadout from '#models/CommunityLoadout.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';

async function refreshCommunityMessage(
  client: ExtendedClient,
  doc: Record<string, any>,
): Promise<void> {
  if (!doc.messageId || !doc.channelId) return;
  const channel = await client.channels.fetch(doc.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const message = await channel.messages.fetch(doc.messageId).catch(() => null);
  if (!message) return;

  const imageUrl = communityImageUrlFromMessage(message);
  if (!imageUrl) {
    log.commands.warn({ publicId: doc.publicId, messageId: doc.messageId }, '[LOADOUTS] Community refresh: no image found in message');
    return;
  }

  const container = await buildCommunityV2Container(doc, COMMUNITY_CHANNEL_LANG, client, imageUrl);

  try {
    await message.edit({
      content: null,
      embeds: [],
      components: [container.toJSON() as any],
      files: [],
      flags: MessageFlags.IsComponentsV2,
    } as any);
  } catch (err: any) {
    log.commands.error({ error: err?.message, publicId: doc.publicId }, '[LOADOUTS] Community refresh: message edit failed');
  }
}

const event: BotEvent<'interactionCreate'> = {
  name: Events.InteractionCreate,
  once: false,

  async execute(client: ExtendedClient, interaction) {
    if (!interaction.isButton()) return;

    const btn = interaction as ButtonInteraction;
    const parsed = parseLoPubCustomId(btn.customId);
    if (!parsed) return;

    const lang = (await getUserLanguage(btn.user.id)) as SupportedLanguage;
    const publicId = parsed.parts[0];
    if (!publicId) return;

    const doc = await CommunityLoadout.findOne({ publicId }).lean();
    if (!doc) {
      await btn.reply({
        content: translate('community.clone.notFound', lang),
        ephemeral: true,
      });
      return;
    }

    // ── Like ─────────────────────────────────────────────────────────────
    if (parsed.action === 'lk') {
      await btn.deferUpdate();
      const uid = btn.user.id;
      const likes = new Set(doc.likes ?? []);
      const dislikes = new Set(doc.dislikes ?? []);
      if (likes.has(uid)) likes.delete(uid);
      else {
        likes.add(uid);
        dislikes.delete(uid);
      }
      await CommunityLoadout.updateOne(
        { publicId },
        { $set: { likes: [...likes], dislikes: [...dislikes] } },
      );
      const updated = await CommunityLoadout.findOne({ publicId }).lean();
      if (updated) await refreshCommunityMessage(client, updated);
      return;
    }

    // ── Dislike ──────────────────────────────────────────────────────────
    if (parsed.action === 'dk') {
      await btn.deferUpdate();
      const uid = btn.user.id;
      const likes = new Set(doc.likes ?? []);
      const dislikes = new Set(doc.dislikes ?? []);
      if (dislikes.has(uid)) dislikes.delete(uid);
      else {
        dislikes.add(uid);
        likes.delete(uid);
      }
      await CommunityLoadout.updateOne(
        { publicId },
        { $set: { likes: [...likes], dislikes: [...dislikes] } },
      );
      const updated = await CommunityLoadout.findOne({ publicId }).lean();
      if (updated) await refreshCommunityMessage(client, updated);
      return;
    }

    // ── Clone — pick slot ────────────────────────────────────────────────
    if (parsed.action === 'cl') {
      const discordId = btn.user.id;
      const userInfo = await UsuarioInfo.findOne({ id: discordId });
      const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
      if (!userInfo || !mainAccount) {
        await btn.reply({
          content: translate('hero.errors.noMain', lang),
          ephemeral: true,
        });
        return;
      }

      const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
      if (!account) {
        await btn.reply({
          content: translate('hero.errors.noAccount', lang),
          ephemeral: true,
        });
        return;
      }

      const slots = await callCoreWithTimeout<StwLoadoutSlot[]>('loadouts.fetchSlots', 60_000, {
        accountId: account.accountId,
        accessToken: account.accessToken,
        lang,
      });
      const rows = buildCloneSlotRows(publicId, slots);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(translate('loadouts.community.clonePickTitle', lang))
        .setDescription(
          translate('loadouts.community.clonePickDesc', lang, { name: doc.name }),
        );

      await btn.reply({
        embeds: [embed],
        components: rows,
        ephemeral: true,
      });
      return;
    }

    // ── Clone — apply to slot ────────────────────────────────────────────
    if (parsed.action === 'cs') {
      const targetLoadoutGUID = parsed.parts[1];
      if (!targetLoadoutGUID) return;

      await btn.deferReply({ ephemeral: true });

      const discordId = btn.user.id;
      const userInfo = await UsuarioInfo.findOne({ id: discordId });
      const mainAccount = userInfo?.deviceAuths?.find((a: any) => a.cuentaMain);
      if (!userInfo || !mainAccount) {
        await btn.editReply({ content: translate('hero.errors.noMain', lang) });
        return;
      }

      const { account } = await refreshAccountToken(userInfo, mainAccount.accountId);
      if (!account) {
        await btn.editReply({ content: translate('hero.errors.noAccount', lang) });
        return;
      }

      const result = await callCoreWithTimeout<CloneLoadoutResult>('loadouts.clone', 5 * 60_000, {
        accountId: account.accountId,
        accessToken: account.accessToken,
        snapshot: {
          commanderTemplateId: doc.commanderTemplateId,
          teamHeroTemplateIds: doc.teamHeroTemplateIds ?? [],
          teamPerkTemplateId: doc.teamPerkTemplateId ?? '',
          gadgets: doc.gadgets ?? [],
        },
        targetLoadoutGUID,
        lang,
      });

      if (result.assignments.length > 0) {
        await CommunityLoadout.updateOne({ publicId }, { $inc: { saves: 1 } });
        const updated = await CommunityLoadout.findOne({ publicId }).lean();
        if (updated) await refreshCommunityMessage(client, updated);
      }

      const emojiSuccess = getEmoji(client, 'success');
      const emojiError = getEmoji(client, 'error');
      const accentColor =
        result.errors.length === 0
          ? 0x2ecc71
          : result.assignments.length === 0
            ? 0xcf0d10
            : 0xffa500;

      let text =
        result.errors.length === 0
          ? `${emojiSuccess} ${translate('community.clone.success', lang, {
              name: doc.name,
              slot: String(result.targetSlotIndex),
            })}`
          : `${emojiError} ${translate('community.clone.partialErrors', lang)}\n${result.errors.map((e) => `> ${e}`).join('\n')}`;

      if (result.assignments.length > 0 && result.errors.length > 0) {
        text =
          `${emojiSuccess} ${translate('community.clone.success', lang, {
            name: doc.name,
            slot: String(result.targetSlotIndex),
          })}\n\n⚠️ ${translate('community.clone.partialErrors', lang)}\n` +
          result.errors.map((e) => `> ${e}`).join('\n');
      }

      const embed = new EmbedBuilder().setColor(accentColor).setDescription(text);
      await btn.editReply({ embeds: [embed], components: [] });

      log.commands.info(
        {
          discordId,
          publicId,
          slot: targetLoadoutGUID,
          ok: result.assignments.length,
          fail: result.errors.length,
        },
        '[LOADOUTS] Community clone',
      );
    }
  },
};

export default event;
