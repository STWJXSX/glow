import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import { log } from '#helpers/core/logger.ts';
import {
  formatCatalogChoiceLabel,
  loadShopCatalog,
  parseShopItemNumber,
  resolveShopCatalogItem,
  type ShopCatalogItem,
} from '#helpers/epic/br/shop/shopCatalog.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  stripAutocompleteLabel,
} from '#helpers/commands/epic/epicEmbedHelper.ts';
import {
  EPIC_CONFIRM_IDLE_MS,
  editReplyInactive,
  isCollectorIdle,
} from '#helpers/commands/epic/epicCollectorHelper.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

function filterCatalogForAutocomplete(
  catalog: ReturnType<typeof loadShopCatalog>,
  focusedValue: string,
): ShopCatalogItem[] {
  if (!catalog?.items?.length) return [];

  const normalized = focusedValue.trim().toLowerCase();
  const byNumber = parseShopItemNumber(focusedValue);

  let items = catalog.items;
  if (byNumber !== null) {
    items = items.filter((item) => String(item.number).startsWith(String(byNumber)));
  } else if (normalized) {
    items = items.filter((item) => {
      return (
        item.name.toLowerCase().includes(normalized) ||
        String(item.number).includes(normalized.replace('#', ''))
      );
    });
  }

  return items.slice(0, 25);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy a cosmetic from the shop')
    .setNameLocalizations(buildDiscordLocalizations('buy.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('buy.cmd._1'))
    .setDMPermission(true)
    .addStringOption((option) =>
      option
        .setName('cosmetic')
        .setDescription('Shop item number (#12) or cosmetic name')
        .setNameLocalizations(buildDiscordLocalizations('buy.cmd.options.cosmetic.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('buy.cmd._2'))
        .setRequired(true)
        .setAutocomplete(true),
    ) as any,

  auth: true,

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    const userId = interaction.user.id;
    const userLanguage = await getFortniteApiLanguageCode(userId, interaction.locale);

    try {
      if (focusedOption.name === 'cosmetic' || focusedOption.name === 'cosmetico') {
        const catalog = loadShopCatalog(userLanguage);

        if (!catalog) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'buy.autocomplete.shopUnavailable', undefined, interaction.locale),
              ),
              value: 'unavailable',
            },
          ]);
          return;
        }

        const items = filterCatalogForAutocomplete(catalog, focusedOption.value);

        if (items.length === 0) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'buy.autocomplete.noItems', undefined, interaction.locale),
              ),
              value: 'no_items',
            },
          ]);
          return;
        }

        const choices = items.map((item) => ({
          name: formatCatalogChoiceLabel(item),
          value: `#${item.number}`,
        }));

        await interaction.respond(choices);
      }
    } catch (error) {
      log.epic.error({ error }, 'Error en autocompletado de buy');
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(userId, 'buy.autocomplete.unexpectedError', undefined, interaction.locale),
          ),
          value: 'error',
        },
      ]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client;
    const userId = interaction.user.id;
    const userLanguage = await getFortniteApiLanguageCode(userId, interaction.locale);

    const cosmeticName =
      interaction.options.getString('cosmetic') || interaction.options.getString('cosmetico');

    if (!cosmeticName || ['unavailable', 'no_items', 'error'].includes(cosmeticName)) {
      await replyEpicCustomError(interaction, userId, 'buy.errors.shopDataUnavailable');
      return;
    }

    try {
      const user = await UsuarioInfo.findOne({ id: userId });

      if (!user?.deviceAuths?.length) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);

      if (!mainAccount) {
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const author = await getEpicAuthor(userId);

      log.epic.debug({ language: userLanguage }, 'Leyendo catálogo de la tienda');
      const catalog = loadShopCatalog(userLanguage);

      if (!catalog) {
        await replyEpicCustomError(interaction, userId, 'buy.errors.shopDataUnavailable');
        return;
      }

      const shopItem = resolveShopCatalogItem(catalog, cosmeticName);

      if (!shopItem) {
        await replyEpicCustomError(interaction, userId, 'buy.errors.cosmeticNotFound');
        return;
      }

      log.epic.debug({ cosmetic: shopItem.number, name: shopItem.name }, 'Cosmético encontrado, mostrando confirmación');

      const title = await translateForUser(userId, 'buy.confirm.title', undefined, interaction.locale);
      const confirmDesc = await translateForUser(
        userId,
        'buy.confirm.description',
        { name: shopItem.name },
        interaction.locale,
      );
      const typeLabel = await translateForUser(userId, 'buy.confirm.fields.type', undefined, interaction.locale);
      const rarityLabel = await translateForUser(userId, 'buy.confirm.fields.rarity', undefined, interaction.locale);
      const vbucksEmoji = getEmoji(client, 'vbucks');

      const description = [
        epicQuote(confirmDesc),
        '',
        `**#${shopItem.number} · ${shopItem.name}**`,
        `${vbucksEmoji} **${shopItem.price.toLocaleString()}**`,
        '',
        epicSection(typeLabel),
        epicQuote(shopItem.type),
        '',
        epicSection(rarityLabel),
        epicQuote(shopItem.rarity),
        '',
        epicQuote(
          await translateForUser(userId, 'buy.confirm.footer', undefined, interaction.locale),
        ),
      ].join('\n');

      const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_buy')
        .setLabel(await translateForUser(userId, 'buy.confirm.button', undefined, interaction.locale))
        .setStyle(ButtonStyle.Success);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_buy')
        .setLabel(await translateForUser(userId, 'buy.cancel.button', undefined, interaction.locale))
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

      const payload = await buildEpicReplyPayload(
        userId,
        {
          style: 'info',
          title,
          description,
          author,
          image: shopItem.image || undefined,
          footerKey: 'brand',
        },
        interaction,
        interaction.locale,
      );

      const reply = await interaction.editReply({
        ...payload,
        components: [row],
      });

      const collector = reply.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        idle: EPIC_CONFIRM_IDLE_MS,
        max: 1,
      });

      collector.on('collect', async (i) => {
        if (i.customId === 'confirm_buy') {
          await i.deferUpdate();

          try {
            const userDb = await UsuarioInfo.findOne({ id: userId });
            if (!userDb) throw { errorCode: 'no_account' };

            const { account: freshAccount, error: tokenError } = await refreshAccountToken(
              userDb,
              mainAccount.accountId,
            );
            if (tokenError || !freshAccount) {
              await replyEpicCustomError(interaction, userId, 'buy.errors.tokenRefreshFailed');
              return;
            }

            const purchase = await callCoreWithTimeout<{ ok: boolean; errorCode?: string; message?: string }>(
              'buy.purchase',
              60_000,
              freshAccount.accountId,
              freshAccount.accessToken,
              shopItem.offerId,
              shopItem.price,
            );
            if (!purchase.ok) {
              throw Object.assign(new Error(purchase.message ?? 'Purchase failed'), { errorCode: purchase.errorCode });
            }

            const successTitle = await translateForUser(userId, 'buy.success.title', undefined, interaction.locale);
            const successDesc = await translateForUser(
              userId,
              'buy.success.description',
              { name: shopItem.name },
              interaction.locale,
            );

            await replyWithEpicEmbed(interaction, userId, {
              style: 'success',
              title: successTitle,
              description: epicEmojiLine(client, 'success', successDesc),
              author,
              footerKey: 'brand',
            });
          } catch (err: any) {
            const errorCode = err.errorCode || '';
            log.epic.error({ error: err, cosmetic: cosmeticName }, 'Error en compra MCP');

            if (errorCode === 'errors.com.epicgames.modules.gameplayutils.not_enough_mtx') {
              await replyWithEpicEmbed(interaction, userId, {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'novbucks',
                  await translateForUser(userId, 'buy.errors.notEnoughVbucks', undefined, interaction.locale),
                ),
                author,
                footerKey: 'brand',
              });
            } else if (errorCode === 'errors.com.epicgames.modules.profiles.operation_forbidden') {
              await replyWithEpicEmbed(interaction, userId, {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'error',
                  await translateForUser(userId, 'buy.errors.alreadyOwned', undefined, interaction.locale),
                ),
                author,
                footerKey: 'brand',
              });
            } else {
              const detail = err.message || err.errorData?.errorMessage || 'Purchase failed';
              await replyWithEpicEmbed(interaction, userId, {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'error',
                  await translateForUser(
                    userId,
                    'buy.errors.purchaseFailed',
                    { error: detail },
                    interaction.locale,
                  ),
                ),
                author,
                footerKey: 'brand',
              });
            }
          }
        } else {
          const cancelPayload = await buildEpicReplyPayload(
            userId,
            {
              style: 'warning',
              description: await translateForUser(userId, 'buy.cancel.description', undefined, interaction.locale),
              author,
              footerKey: 'brand',
            },
            interaction,
            interaction.locale,
          );
          await i.update({ ...cancelPayload, components: [] });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (!isCollectorIdle(reason) || collected.size > 0) return;
        const inactive = await translateForUser(userId, 'epic.inactiveConfirm', undefined, interaction.locale);
        await editReplyInactive(interaction, inactive).catch(() => {});
      });
    } catch (error) {
      log.epic.error({ error }, 'Error en comando buy');
      await replyEpicCustomError(interaction, userId, 'buy.errors.unexpected');
    }
  },
};

export default command;
