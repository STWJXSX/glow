import {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChatInputCommandInteraction, AttachmentBuilder,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder,
  SeparatorSpacingSize, MessageFlags,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, buildLocalizedChoices, translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { log } from '#helpers/core/logger.ts';
import { SHOP_COSMETIC_TYPES, type ShopImageVariant, type ShopCosmeticType } from '#managers/epic/shop/types.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import {
  buildEpicEmbed,
  epicEmojiLine,
  epicQuote,
  epicSection,
  getEpicAuthor,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_PANEL_IDLE_MS,
  isCollectorIdle,
  editReplyInactive,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

const ITEMS_PER_PAGE = 5;
const SHOP_IMAGE_VARIANTS: ShopImageVariant[] = ['no_jam_tracks', 'full', 'jam_tracks_only'];
const SHOP_VARIANT_CHOICES = buildLocalizedChoices(
  'shop.cmd.image.options.variant.choices',
  SHOP_IMAGE_VARIANTS.map((value) => ({ value })),
);
const SHOP_TYPE_CHOICES = buildLocalizedChoices(
  'shop.cmd.image.options.type.choices',
  SHOP_COSMETIC_TYPES.map((value) => ({ value })),
);

function parseShopImageVariant(value: string | null): ShopImageVariant {
  if (value && SHOP_IMAGE_VARIANTS.includes(value as ShopImageVariant)) {
    return value as ShopImageVariant;
  }
  return 'no_jam_tracks';
}

function parseShopCosmeticType(value: string | null): ShopCosmeticType | null {
  if (value && (SHOP_COSMETIC_TYPES as readonly string[]).includes(value)) {
    return value as ShopCosmeticType;
  }
  return null;
}

function getShopImageFileName(
  variant: ShopImageVariant,
  ext: string,
  cosmeticType?: ShopCosmeticType | null,
): string {
  if (cosmeticType) return `tienda_${cosmeticType}.${ext}`;
  if (variant === 'no_jam_tracks') return `tienda_sin_pistas.${ext}`;
  if (variant === 'jam_tracks_only') return `tienda_solo_pistas.${ext}`;
  return `tienda_completa.${ext}`;
}

async function createShopImageButtonRow(
  userId: string,
  locale: string | null | undefined,
  glowShopUrl: string,
): Promise<ActionRowBuilder<ButtonBuilder>> {
  const label = await translateForUser(userId, 'shop.image.button', undefined, locale);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(label === 'shop.image.button' ? 'Glow Shop' : label)
      .setStyle(ButtonStyle.Link)
      .setURL(glowShopUrl),
  );
}

// ── Types ────────────────────────────────────────────────────

interface ShopEntry {
  number?: number;
  name: string;
  offerId: string;
  price: number;
  rarity: string;
  type: string;
  isBundle: boolean;
  imageUrl: string | null;
  sectionName: string;
  sectionIndex: number;
  sortPriority: number;
}

interface ShopTextResult {
  items: ShopEntry[];
  shopUrl: string;
  glowShopUrl: string;
}

interface ShopLinksResult {
  shopUrl: string;
  glowShopUrl: string;
}

// ── /shop text — Components V2 ──────────────────────────────

async function handleTextShop(interaction: ChatInputCommandInteraction, apiLanguage: string) {
  const userId = interaction.user.id;
  const client = interaction.client as any;

  try {
    const shop = await callCoreWithTimeout<ShopTextResult>('shop.text', 60_000, { language: apiLanguage });
    const items = shop.items;

    if (!items || items.length === 0) {
      const errContainer = new ContainerBuilder().setAccentColor(EMBED_COLORS.error);
      errContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          epicEmojiLine(
            client,
            'error',
            await translateForUser(userId, 'shop.text.noItems', undefined, interaction.locale),
          ),
        ),
      );
      await interaction.editReply({
        embeds: [],
        components: [errContainer.toJSON() as any],
        flags: MessageFlags.IsComponentsV2,
      } as any);
      return;
    }

    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    let currentPage = 0;

    const emojiVbucks = getEmoji(client, 'vbucks');
    const tPrev = await translateForUser(userId, 'shop.text.buttons.previous', undefined, interaction.locale);
    const tNext = await translateForUser(userId, 'shop.text.buttons.next', undefined, interaction.locale);
    const tTitle = await translateForUser(userId, 'shop.text.embed.title', undefined, interaction.locale);

    const authorData = await getEpicAuthor(userId);
    const hasAccount = !!authorData;
    const avatarUrl = authorData?.iconURL;
    const authorName = authorData?.name;

    function buildPage(page: number): { container: ContainerBuilder; pageItems: ShopEntry[] } {
      const start = page * ITEMS_PER_PAGE;
      const pageItems = items!.slice(start, start + ITEMS_PER_PAGE);

      const container = new ContainerBuilder().setAccentColor(0xFF6B35);

      // Header — con avatar solo si tiene cuenta
      if (hasAccount && avatarUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${tTitle}\n-# ${authorName} \u00b7 ${page + 1}/${totalPages} \u00b7 ${items!.length} items`
              )
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        );
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${tTitle}\n-# ${page + 1}/${totalPages} \u00b7 ${items!.length} items`
          )
        );
      }
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      // Items agrupados por sección
      let lastSection = '';
      for (const item of pageItems) {
        if (item.sectionName !== lastSection) {
          lastSection = item.sectionName;
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${epicSection(item.sectionName)}`),
          );
        }

        const priceText = `${emojiVbucks} **${item.price.toLocaleString()}**`;
        const numberPrefix = item.number ? `**#${item.number}** · ` : '';
        const text = `${numberPrefix}**${item.name}**\n${priceText} — ${item.type} · ${item.rarity}`;

        if (item.imageUrl) {
          container.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(item.imageUrl))
          );
        } else {
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
        }
      }

      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      // Buy buttons solo si tiene cuenta registrada (max 5 por ActionRow)
      if (hasAccount) {
        const buyRow = new ActionRowBuilder<ButtonBuilder>();
        for (let i = 0; i < pageItems.length; i++) {
          const label = pageItems[i].name.length > 15
            ? pageItems[i].name.substring(0, 13) + '..'
            : pageItems[i].name;
          buyRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`shop_buy_${page}_${i}`)
              .setLabel(label)
              .setStyle(ButtonStyle.Success)
          );
        }
        container.addActionRowComponents(buyRow);
      }

      // Navegación + Link
      const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('shop_prev')
          .setLabel(tPrev)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('shop_next')
          .setLabel(tNext)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
          .setLabel('Fortnite Shop')
          .setStyle(ButtonStyle.Link)
          .setURL(shop.shopUrl),
      );
      container.addActionRowComponents(navRow);

      return { container, pageItems };
    }

    let { container } = buildPage(currentPage);

    await interaction.editReply({
      embeds: [],
      components: [container.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any);

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      idle: EPIC_PANEL_IDLE_MS,
    });

    collector.on('collect', async (btn) => {
      const cid = btn.customId;

      // ── Buy button ──
      if (cid.startsWith('shop_buy_')) {
        const parts = cid.split('_');
        const pageIdx = parseInt(parts[2]);
        const itemIdx = parseInt(parts[3]);
        const item = items![pageIdx * ITEMS_PER_PAGE + itemIdx];

        if (!item) {
          await btn.reply({
            content: epicEmojiLine(client, 'error', await translateForUser(userId, 'buy.errors.cosmeticNotFound', undefined, interaction.locale)),
            ephemeral: true,
          });
          return;
        }

        const tConfirmTitle = await translateForUser(userId, 'buy.confirm.title', undefined, interaction.locale);
        const tConfirmFooter = await translateForUser(userId, 'buy.confirm.footer', undefined, interaction.locale);
        const tBuy = await translateForUser(userId, 'buy.confirm.button', undefined, interaction.locale);
        const tCancel = await translateForUser(userId, 'buy.cancel.button', undefined, interaction.locale);
        const typeLabel = await translateForUser(userId, 'buy.confirm.fields.type', undefined, interaction.locale);
        const rarityLabel = await translateForUser(userId, 'buy.confirm.fields.rarity', undefined, interaction.locale);

        const confirmDescription = [
          epicQuote(`**${item.name}**`),
          `${emojiVbucks} **${item.price.toLocaleString()}**`,
          '',
          epicSection(typeLabel),
          epicQuote(item.type),
          '',
          epicSection(rarityLabel),
          epicQuote(item.rarity),
          '',
          epicQuote(tConfirmFooter),
        ].join('\n');

        const confirmEmbed = await buildEpicEmbed(
          userId,
          {
            style: 'info',
            title: tConfirmTitle,
            description: confirmDescription,
            image: item.imageUrl || undefined,
            footerKey: 'brand',
          },
          interaction,
          interaction.locale,
        );

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`shop_confirm_${pageIdx}_${itemIdx}`)
            .setLabel(tBuy)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('shop_cancel_buy')
            .setLabel(tCancel)
            .setStyle(ButtonStyle.Danger),
        );

        await btn.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
        return;
      }

      // ── Confirm purchase ──
      if (cid.startsWith('shop_confirm_')) {
        await btn.deferUpdate();
        const parts = cid.split('_');
        const pageIdx = parseInt(parts[2]);
        const itemIdx = parseInt(parts[3]);
        const item = items![pageIdx * ITEMS_PER_PAGE + itemIdx];
        if (!item) return;

        try {
          const user = await UsuarioInfo.findOne({ id: userId });
          if (!user?.deviceAuths?.length) {
            const errEmbed = await buildEpicEmbed(
              userId,
              {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'error',
                  await translateForUser(userId, 'generarEmbedError.noCuenta', undefined, interaction.locale),
                ),
                footerKey: 'brand',
              },
              interaction,
              interaction.locale,
            );
            await btn.editReply({ embeds: [errEmbed], components: [] });
            return;
          }

          const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);
          if (!mainAccount) {
            const errEmbed = await buildEpicEmbed(
              userId,
              {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'error',
                  await translateForUser(userId, 'generarEmbedError.noMain', undefined, interaction.locale),
                ),
                footerKey: 'brand',
              },
              interaction,
              interaction.locale,
            );
            await btn.editReply({ embeds: [errEmbed], components: [] });
            return;
          }

          const { account: freshAccount, error: tokenError } = await refreshAccountToken(user, mainAccount.accountId);
          if (tokenError || !freshAccount) {
            const errEmbed = await buildEpicEmbed(
              userId,
              {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'error',
                  await translateForUser(userId, 'buy.errors.tokenRefreshFailed', undefined, interaction.locale),
                ),
                footerKey: 'brand',
              },
              interaction,
              interaction.locale,
            );
            await btn.editReply({ embeds: [errEmbed], components: [] });
            return;
          }

          const purchase = await callCore<{ ok: boolean; errorCode?: string; message?: string }>(
            'br.shop.purchase',
            freshAccount.accountId,
            freshAccount.accessToken,
            item.offerId,
            item.price,
          );
          if (!purchase.ok) {
            throw Object.assign(new Error(purchase.message ?? 'Purchase failed'), { errorCode: purchase.errorCode });
          }

          const successDesc = await translateForUser(
            userId,
            'buy.success.description',
            { name: item.name },
            interaction.locale,
          );
          const successEmbed = await buildEpicEmbed(
            userId,
            {
              style: 'success',
              description: epicEmojiLine(client, 'success', successDesc),
              image: item.imageUrl || undefined,
              footerKey: 'brand',
            },
            interaction,
            interaction.locale,
          );

          await btn.editReply({ embeds: [successEmbed], components: [] });
        } catch (err: any) {
          const errorCode = err.errorCode || '';
          log.epic.error({ error: err, cosmetic: item.name }, 'Error en compra desde shop text');

          let errorKey = 'buy.errors.purchaseFailed';
          let emojiKey: Parameters<typeof getEmoji>[1] = 'error';
          let detail = err.message || err.errorData?.errorMessage || 'Purchase failed';

          if (errorCode === 'errors.com.epicgames.modules.gameplayutils.not_enough_mtx') {
            errorKey = 'buy.errors.notEnoughVbucks';
            emojiKey = 'novbucks';
            detail = '';
          } else if (errorCode === 'errors.com.epicgames.modules.profiles.operation_forbidden') {
            errorKey = 'buy.errors.alreadyOwned';
            detail = '';
          }

          const errorMsg = detail
            ? await translateForUser(userId, errorKey, { error: detail }, interaction.locale)
            : await translateForUser(userId, errorKey, undefined, interaction.locale);

          const errEmbed = await buildEpicEmbed(
            userId,
            {
              style: 'error',
              description: epicEmojiLine(client, emojiKey, errorMsg),
              footerKey: 'brand',
            },
            interaction,
            interaction.locale,
          );

          await btn.editReply({ embeds: [errEmbed], components: [] });
        }
        return;
      }

      // ── Cancel buy ──
      if (cid === 'shop_cancel_buy') {
        const cancelEmbed = await buildEpicEmbed(
          userId,
          {
            style: 'warning',
            description: await translateForUser(userId, 'buy.cancel.description', undefined, interaction.locale),
            footerKey: 'brand',
          },
          interaction,
          interaction.locale,
        );
        await btn.update({ embeds: [cancelEmbed], components: [] });
        return;
      }

      // ── Pagination ──
      if (cid === 'shop_prev' || cid === 'shop_next') {
        await btn.deferUpdate();
        if (cid === 'shop_prev' && currentPage > 0) currentPage--;
        if (cid === 'shop_next' && currentPage < totalPages - 1) currentPage++;

        const result = buildPage(currentPage);
        await interaction.editReply({
          embeds: [],
          components: [result.container.toJSON() as any],
          flags: MessageFlags.IsComponentsV2,
        } as any).catch(() => {});
        return;
      }
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      const inactive = await translateForUser(
        interaction.user.id,
        'epic.inactivePanel',
        undefined,
        interaction.locale,
      );
      await editReplyInactive(interaction, inactive);
    });

  } catch (error) {
    log.epic.error({ error }, 'Error al obtener la tienda de Fortnite');
    const client = interaction.client as any;
    const errContainer = new ContainerBuilder().setAccentColor(EMBED_COLORS.error);
    errContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        epicEmojiLine(
          client,
          'error',
          await translateForUser(interaction.user.id, 'shop.text.error', undefined, interaction.locale),
        ),
      ),
    );
    await interaction.editReply({
      embeds: [],
      components: [errContainer.toJSON() as any],
      flags: MessageFlags.IsComponentsV2,
    } as any).catch(() => {});
  }
}

interface ShopImageResult {
  ok: boolean;
  buffer?: string;
  ext?: string;
  imageUrl?: string;
  preferHosted?: boolean;
  kind?: 'no_items' | 'web_down' | 'error';
  message?: string;
  base?: string;
}

async function replyShopImageError(
  interaction: ChatInputCommandInteraction,
  userId: string,
  errorKey: string,
  base?: string,
): Promise<void> {
  const errContainer = new ContainerBuilder().setAccentColor(EMBED_COLORS.error);
  errContainer.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      epicEmojiLine(
        interaction.client,
        'error',
        base
          ? await translateForUser(userId, errorKey, { base }, interaction.locale)
          : await translateForUser(userId, errorKey, undefined, interaction.locale),
      ),
    ),
  );
  await interaction.editReply({
    embeds: [],
    components: [errContainer.toJSON() as any],
    flags: MessageFlags.IsComponentsV2,
  } as any).catch(() => {});
}

/**
 * Maneja el subcomando de imagen (desde cache con selectMenu)
 */
async function handleImageShop(interaction: ChatInputCommandInteraction, apiLanguage: string) {
  const userId = interaction.user.id;
  const variant = parseShopImageVariant(interaction.options.getString('variant'));
  const cosmeticType = parseShopCosmeticType(interaction.options.getString('type'));

  try {
    const result = await callCoreWithTimeout<ShopImageResult>(
      'shop.image',
      10 * 60_000,
      apiLanguage,
      variant,
      cosmeticType,
    );

    if (!result.ok) {
      log.epic.error({ error: result.message, kind: result.kind }, 'Error enviando tienda desde cache');
      const errorKey = result.kind === 'no_items'
        ? 'shop.image.noItemsType'
        : result.kind === 'web_down'
          ? 'shop.image.webPlatformDown'
          : 'shop.image.error';
      await replyShopImageError(
        interaction,
        userId,
        errorKey,
        result.kind === 'web_down' ? result.base : undefined,
      );
      return;
    }

    const imageBuffer = Buffer.from(result.buffer ?? '', 'base64');
    const fileName = getShopImageFileName(variant, result.ext || 'png', cosmeticType);
    const fileSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);

    const imageUrl = result.imageUrl;
    const preferHosted = result.preferHosted === true && Boolean(imageUrl);

    const attachment = preferHosted ? null : new AttachmentBuilder(imageBuffer, { name: fileName });
    const links = await callCore<ShopLinksResult>('shop.links');
    const shopButtonRow = await createShopImageButtonRow(userId, interaction.locale, links.glowShopUrl);

    await interaction.editReply({
      content: preferHosted && imageUrl ? imageUrl : null,
      embeds: [],
      files: attachment ? [attachment] : [],
      components: [shopButtonRow],
    });

    log.epic.info(
      { language: apiLanguage, variant, cosmeticType, size: fileSizeMB, cached: !cosmeticType },
      cosmeticType ? 'Tienda enviada (filtro por tipo)' : 'Tienda enviada desde cache',
    );
  } catch (error: any) {
    log.epic.error({ error: error?.message || error, stack: error?.stack }, 'Error enviando tienda desde cache');

    const noItemsMsg = error?.message?.includes('No hay objetos en la tienda');
    const errorKey = noItemsMsg ? 'shop.image.noItemsType' : 'shop.image.error';

    await replyShopImageError(interaction, userId, errorKey);
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Show the Fortnite shop in different formats')
    .setNameLocalizations(buildDiscordLocalizations('shop.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('shop.cmd._1'))
    .addSubcommand(sub =>
      sub
        .setName('text')
        .setDescription('Shop in text format')
        .setNameLocalizations(buildDiscordLocalizations('shop.cmd.text.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('shop.cmd._2'))
    )
    .addSubcommand(sub =>
      sub
        .setName('image')
        .setDescription('Shop in image format')
        .setNameLocalizations(buildDiscordLocalizations('shop.cmd.image.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('shop.cmd._3'))
        .addStringOption(opt =>
          opt
            .setName('variant')
            .setDescription('Shop image variant')
            .setNameLocalizations(buildDiscordLocalizations('shop.cmd.image.options.variant.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('shop.cmd._4'))
            .setRequired(false)
            .addChoices(...SHOP_VARIANT_CHOICES)
        )
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Filter by cosmetic type')
            .setNameLocalizations(buildDiscordLocalizations('shop.cmd.image.options.type.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('shop.cmd._5'))
            .setRequired(false)
            .addChoices(...SHOP_TYPE_CHOICES)
        )
    )
    .setDMPermission(true),

  auth: true,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const apiLanguage = await getFortniteApiLanguageCode(userId, interaction.locale);
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'text' || subcommand === 'texto') {
      await handleTextShop(interaction, apiLanguage);
    } else if (subcommand === 'image' || subcommand === 'imagen') {
      await handleImageShop(interaction, apiLanguage);
    }
  }
};

export default command;
