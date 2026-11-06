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
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import {
  formatCatalogChoiceLabel,
  resolveShopCatalogItem,
} from '#helpers/epic/br/shop/shopCatalog.ts';
import {
  loadEnglishFortniteShopCatalog,
  getShopCatalogForAutocomplete,
  isCurrentShopCatalog,
  filterGiftCatalogForAutocomplete,
} from '#giftbots/fortniteShopCatalog.ts';
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
import { GiftBotAccount } from '#models/GiftBotPool.ts';
import {
  applyBotSpend,
  ensureBotToken,
  findBotForMain,
  getWalletBalance,
  walletCredit,
  walletTryDebit,
} from '#giftbots/pool.ts';

const CONFIRM_ID = 'giftbots_giftbot_confirm';
const CANCEL_ID = 'giftbots_giftbot_cancel';

const T = 'giftbotsGiftbot';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('giftbot')
    .setDescription('Gift a shop cosmetic to your main account using a giftbot and your balance')
    .setNameLocalizations(buildDiscordLocalizations('giftbotsGiftbot.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('giftbotsGiftbot.cmd.description'))
    .setDMPermission(true)
    .addStringOption((option) =>
      option
        .setName('cosmetic')
        .setDescription('Item number (#12) or name (English shop)')
        .setNameLocalizations(buildDiscordLocalizations('giftbotsGiftbot.cmd.options.cosmetic.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('giftbotsGiftbot.cmd.options.cosmetic.description'))
        .setRequired(true)
        .setAutocomplete(true),
    ) as any,

  auth: true,

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    const userId = interaction.user.id;
    const locale = interaction.locale;

    try {
      // Only the main-account flags are needed here — keeps the 3s autocomplete budget.
      const user = await UsuarioInfo.findOne({ id: userId }).select('deviceAuths.cuentaMain').lean();
      if (!user?.deviceAuths?.length) {
        await interaction.respond([
          {
            name: stripAutocompleteLabel(
              await translateForUser(userId, 'gift.autocomplete.noAccount', undefined, locale),
            ),
            value: 'error',
          },
        ]);
        return;
      }

      if (!user.deviceAuths.some((acc: any) => acc.cuentaMain)) {
        await interaction.respond([
          {
            name: stripAutocompleteLabel(
              await translateForUser(userId, `${T}.autocomplete.noMain`, undefined, locale),
            ),
            value: 'error',
          },
        ]);
        return;
      }

      if (focusedOption.name === 'cosmetic' || focusedOption.name === 'cosmetico') {
        const catalog = await getShopCatalogForAutocomplete();
        if (!catalog?.items?.length) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.shopUnavailable', undefined, locale),
              ),
              value: 'error',
            },
          ]);
          return;
        }
        const items = filterGiftCatalogForAutocomplete(catalog, focusedOption.value);
        if (!items.length) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.noGiftableItems', undefined, locale),
              ),
              value: 'error',
            },
          ]);
          return;
        }
        await interaction.respond(
          items.map((item) => ({
            name: stripAutocompleteLabel(formatCatalogChoiceLabel(item)),
            value: `offer:${item.offerId}`,
          })),
        );
      }
    } catch (error) {
      log.epic.error({ error }, '[giftbots/giftbot] autocomplete');
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(userId, 'gift.autocomplete.unexpectedError', undefined, interaction.locale),
          ),
          value: 'error',
        },
      ]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client;
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const cosmeticInput =
      interaction.options.getString('cosmetic') || interaction.options.getString('cosmetico');

    if (!cosmeticInput || ['error', 'unavailable'].includes(cosmeticInput)) {
      await replyEpicCustomError(interaction, userId, 'gift.errors.shopDataUnavailable');
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
      const mainName = mainAccount.displayName || mainAccount.accountId;

      const author = await getEpicAuthor(userId);

      const catalog = await loadEnglishFortniteShopCatalog();
      // Never resolve a purchase against an old shop: "#12" or a name could mean another item.
      if (!catalog || !isCurrentShopCatalog(catalog)) {
        await replyEpicCustomError(interaction, userId, 'gift.errors.shopDataUnavailable');
        return;
      }

      const shopItem = resolveShopCatalogItem(catalog, cosmeticInput, { giftableOnly: true });
      if (!shopItem) {
        await replyEpicCustomError(interaction, userId, 'gift.errors.cosmeticNotFound');
        return;
      }

      const balance = await getWalletBalance(userId);
      if (balance < shopItem.price) {
        await replyEpicCustomError(interaction, userId, `${T}.errors.noBalance`, {
          balance: balance.toLocaleString('en-US'),
          price: shopItem.price.toLocaleString('en-US'),
        });
        return;
      }

      const { eligible, others, poolEmpty } = await findBotForMain(mainAccount.accountId, shopItem.price);
      if (!eligible || eligible.status !== 'eligible') {
        if (poolEmpty) {
          await replyEpicCustomError(interaction, userId, `${T}.errors.poolEmpty`);
        } else {
          const recent = others.find((o) => o.status === 'tooRecent');
          const botNames = others
            .map((o) => o.bot.displayName || o.bot.label)
            .filter(Boolean)
            .map((n) => `\`${n}\``)
            .join(', ');
          await replyEpicCustomError(
            interaction,
            userId,
            recent ? `${T}.errors.tooRecent` : `${T}.errors.notFriends`,
            { main: mainName, bots: botNames },
          );
        }
        return;
      }

      const bot = eligible.bot;
      const botName = bot.displayName || bot.label || bot.deviceAuth.accountId;
      const remaining = balance - shopItem.price;

      const vbucksEmoji = getEmoji(client, 'vbucks');
      const title = await translateForUser(userId, 'gift.confirm.title', undefined, locale);
      const toMain = await translateForUser(userId, `${T}.confirm.toMain`, { main: mainName }, locale);
      const viaBot = await translateForUser(userId, `${T}.confirm.viaBot`, { bot: botName }, locale);
      const balanceLine = await translateForUser(
        userId,
        `${T}.confirm.balance`,
        {
          balance: balance.toLocaleString('en-US'),
          remaining: remaining.toLocaleString('en-US'),
        },
        locale,
      );
      const typeLabel = await translateForUser(userId, 'gift.confirm.fields.type', undefined, locale);
      const rarityLabel = await translateForUser(userId, 'gift.confirm.fields.rarity', undefined, locale);

      const description = [
        `**${toMain}**`,
        '',
        `**#${shopItem.number} · ${shopItem.name}**`,
        `${vbucksEmoji} **${shopItem.price.toLocaleString('en-US')}**`,
        '',
        epicSection(typeLabel),
        epicQuote(shopItem.type),
        '',
        epicSection(rarityLabel),
        epicQuote(shopItem.rarity),
        '',
        epicQuote(viaBot),
        epicQuote(balanceLine),
      ].join('\n');

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CONFIRM_ID)
          .setLabel(await translateForUser(userId, 'gift.confirm.button', undefined, locale))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(CANCEL_ID)
          .setLabel(await translateForUser(userId, 'gift.cancel.button', undefined, locale))
          .setStyle(ButtonStyle.Danger),
      );

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
        locale,
      );

      const reply = await interaction.editReply({ ...payload, components: [row] });

      const collector = reply.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        idle: EPIC_CONFIRM_IDLE_MS,
        max: 1,
      });

      collector.on('collect', async (i) => {
        if (i.customId !== CONFIRM_ID) {
          const cancelPayload = await buildEpicReplyPayload(
            userId,
            {
              style: 'warning',
              description: await translateForUser(userId, 'gift.cancel.description', undefined, locale),
              author,
              footerKey: 'brand',
            },
            interaction,
            locale,
          );
          await i.update({ ...cancelPayload, components: [] });
          return;
        }

        await i.deferUpdate();

        const debited = await walletTryDebit(userId, shopItem.price);
        if (debited === null) {
          await replyEpicCustomError(interaction, userId, `${T}.errors.noBalance`, {
            balance: (await getWalletBalance(userId)).toLocaleString('en-US'),
            price: shopItem.price.toLocaleString('en-US'),
          });
          return;
        }

        try {
          const botDoc = await GiftBotAccount.findOne({
            'deviceAuth.accountId': bot.deviceAuth.accountId,
          }).exec();
          if (!botDoc) throw new Error('giftbot not found');
          const accessToken = await ensureBotToken(botDoc);

          await composeMCP({
            profile: 'common_core',
            operation: 'GiftCatalogEntry',
            accountId: botDoc.deviceAuth.accountId,
            accessToken,
            body: {
              offerId: shopItem.offerId,
              currency: 'MtxCurrency',
              currencySubType: '',
              expectedTotalPrice: shopItem.price,
              receiverAccountIds: [mainAccount.accountId],
              giftWrapTemplateId: '',
              personalMessage: '',
            },
          });

          await applyBotSpend(botDoc.deviceAuth.accountId, shopItem.price);

          const successTitle = await translateForUser(userId, 'gift.success.title', undefined, locale);
          const successDesc = await translateForUser(
            userId,
            'gift.success.description',
            { name: shopItem.name, friend: mainName },
            locale,
          );

          await replyWithEpicEmbed(interaction, userId, {
            style: 'success',
            title: successTitle,
            description: epicEmojiLine(client, 'success', `${successDesc}\n${epicQuote(
              await translateForUser(
                userId,
                `${T}.success.balance`,
                { remaining: debited.toLocaleString('en-US') },
                locale,
              ),
            )}`),
            author,
            footerKey: 'brand',
          });
        } catch (err: any) {
          await walletCredit(userId, shopItem.price).catch(() => {});
          const errorCode = err.errorCode || '';
          log.epic.error({ error: err }, '[giftbots/giftbot] MCP gift failed');

          if (errorCode === 'errors.com.epicgames.modules.profiles.operation_forbidden') {
            await replyWithEpicEmbed(interaction, userId, {
              style: 'error',
              description: epicEmojiLine(
                client,
                'error',
                await translateForUser(userId, 'gift.errors.alreadyOwned', undefined, locale),
              ),
              author,
              footerKey: 'brand',
            });
          } else {
            const detail = err.message || err.errorData?.errorMessage || 'Gift failed';
            await replyWithEpicEmbed(interaction, userId, {
              style: 'error',
              description: epicEmojiLine(
                client,
                'error',
                await translateForUser(userId, 'gift.errors.giftFailed', { error: detail }, locale),
              ),
              author,
              footerKey: 'brand',
            });
          }
        }
      });

      collector.on('end', async (_collected, reason) => {
        if (!isCollectorIdle(reason) || _collected.size > 0) return;
        const inactive = await translateForUser(userId, 'epic.inactiveConfirm', undefined, locale);
        await editReplyInactive(interaction, inactive).catch(() => {});
      });
    } catch (error) {
      log.epic.error({ error }, '[giftbots/giftbot] execute');
      await replyEpicCustomError(interaction, userId, 'gift.errors.unexpected');
    }
  },
};

export default command;
