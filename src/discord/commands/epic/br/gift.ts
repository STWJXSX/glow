import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
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

interface Friend {
  accountId: string;
  displayName: string;
}

function filterGiftCatalogForAutocomplete(
  catalog: ReturnType<typeof loadShopCatalog>,
  focusedValue: string,
): ShopCatalogItem[] {
  if (!catalog?.items?.length) return [];

  const normalized = focusedValue.trim().toLowerCase();
  const byNumber = parseShopItemNumber(focusedValue);

  let items = catalog.items.filter((item) => item.giftable);
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

const ACCOUNT_ID_REGEX = /^[0-9a-f]{32}$/i;

async function getFriendsList(accountId: string, accessToken: string): Promise<Friend[]> {
  const friendsRes = await axios.get<Array<{ accountId: string }>>(
    `${Endpoints.FRIENDS}/${accountId}/friends`,
    { headers: { Authorization: `bearer ${accessToken}` }, timeout: 10000 },
  );

  const ids = friendsRes.data.map((f) => f.accountId);
  if (ids.length === 0) return [];

  const friends: Friend[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const qs = batch.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
    const accountsRes = await axios.get<Array<{ id: string; displayName: string }>>(
      `${Endpoints.ACCOUNT_PUBLIC}?${qs}`,
      { headers: { Authorization: `bearer ${accessToken}` }, timeout: 10000 },
    );
    for (const acc of accountsRes.data) {
      if (acc.displayName) friends.push({ accountId: acc.id, displayName: acc.displayName });
    }
  }

  return friends;
}

function filterFriendsForAutocomplete(
  friends: Friend[],
  focusedValue: string,
): Array<{ name: string; value: string }> {
  if (!friends?.length) return [];

  const filtered = friends.filter((friend) =>
    friend.displayName.toLowerCase().includes(focusedValue.toLowerCase()),
  );

  return filtered.slice(0, 25).map((friend) => ({
    name: friend.displayName,
    value: `${friend.displayName}|${friend.accountId}`,
  }));
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gift')
    .setDescription('Gift a cosmetic from the shop to a friend')
    .setNameLocalizations(buildDiscordLocalizations('gift.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('gift.cmd._1'))
    .setDMPermission(true)
    .addStringOption((option) =>
      option
        .setName('cosmetic')
        .setDescription('Shop item number (#12) or cosmetic name')
        .setNameLocalizations(buildDiscordLocalizations('gift.cmd.options.cosmetic.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('buy.cmd._2'))
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('friend')
        .setDescription('Friend to gift to')
        .setNameLocalizations(buildDiscordLocalizations('gift.cmd.options.friend.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('gift.cmd._2'))
        .setRequired(true)
        .setAutocomplete(true),
    ) as any,

  auth: true,

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    const userId = interaction.user.id;
    const userLanguage = await getFortniteApiLanguageCode(userId, interaction.locale);

    try {
      const user = await UsuarioInfo.findOne({ id: userId });

      if (!user?.deviceAuths?.length) {
        await interaction.respond([
          {
            name: stripAutocompleteLabel(
              await translateForUser(userId, 'gift.autocomplete.noAccount', undefined, interaction.locale),
            ),
            value: 'error',
          },
        ]);
        return;
      }

      const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);

      if (focusedOption.name === 'cosmetic' || focusedOption.name === 'cosmetico') {
        const catalog = loadShopCatalog(userLanguage);

        if (!catalog) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.shopUnavailable', undefined, interaction.locale),
              ),
              value: 'unavailable',
            },
          ]);
          return;
        }

        const items = filterGiftCatalogForAutocomplete(catalog, focusedOption.value);

        if (items.length === 0) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.noGiftableItems', undefined, interaction.locale),
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
      } else if (focusedOption.name === 'friend' || focusedOption.name === 'amigo') {
        if (!mainAccount) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.noAccount', undefined, interaction.locale),
              ),
              value: 'error',
            },
          ]);
          return;
        }

        if (ACCOUNT_ID_REGEX.test(focusedOption.value)) {
          try {
            const res = await axios.get<Array<{ id: string; displayName: string }>>(
              `${Endpoints.ACCOUNT_PUBLIC}?accountId=${focusedOption.value}`,
              { headers: { Authorization: `bearer ${mainAccount.accessToken}` }, timeout: 5000 },
            );
            if (res.data?.[0]?.displayName) {
              await interaction.respond([
                {
                  name: `${res.data[0].displayName} (Account ID)`,
                  value: `${res.data[0].displayName}|${res.data[0].id}`,
                },
              ]);
              return;
            }
          } catch {
            /* ignore */
          }
        }

        const friends = await getFriendsList(mainAccount.accountId, mainAccount.accessToken);

        if (friends.length === 0) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.noFriends', undefined, interaction.locale),
              ),
              value: 'no_friends',
            },
          ]);
          return;
        }

        const choices = filterFriendsForAutocomplete(friends, focusedOption.value);

        if (choices.length === 0) {
          await interaction.respond([
            {
              name: stripAutocompleteLabel(
                await translateForUser(userId, 'gift.autocomplete.noMatchingFriends', undefined, interaction.locale),
              ),
              value: 'no_friends',
            },
          ]);
          return;
        }

        await interaction.respond(choices);
      }
    } catch (error) {
      log.epic.error({ error }, 'Error en autocompletado de gift');
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
    const userLanguage = await getFortniteApiLanguageCode(userId, interaction.locale);

    const cosmeticName =
      interaction.options.getString('cosmetic') || interaction.options.getString('cosmetico');
    const friendData =
      interaction.options.getString('friend') || interaction.options.getString('amigo');

    if (!cosmeticName || ['unavailable', 'no_items', 'error'].includes(cosmeticName)) {
      await replyEpicCustomError(interaction, userId, 'gift.errors.shopDataUnavailable');
      return;
    }

    if (!friendData || ['no_friends', 'error'].includes(friendData)) {
      await replyEpicCustomError(interaction, userId, 'gift.errors.noFriends');
      return;
    }

    let friendDisplayName: string;
    let friendAccountId: string;

    if (friendData.includes('|')) {
      const pipeIdx = friendData.lastIndexOf('|');
      friendDisplayName = friendData.slice(0, pipeIdx);
      friendAccountId = friendData.slice(pipeIdx + 1);
    } else if (ACCOUNT_ID_REGEX.test(friendData)) {
      friendAccountId = friendData;
      friendDisplayName = friendData;
    } else {
      await replyEpicCustomError(interaction, userId, 'gift.errors.invalidFriend');
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

      if (friendDisplayName === friendAccountId && ACCOUNT_ID_REGEX.test(friendAccountId)) {
        try {
          const res = await axios.get<Array<{ id: string; displayName: string }>>(
            `${Endpoints.ACCOUNT_PUBLIC}?accountId=${friendAccountId}`,
            { headers: { Authorization: `bearer ${mainAccount.accessToken}` }, timeout: 5000 },
          );
          if (res.data?.[0]?.displayName) friendDisplayName = res.data[0].displayName;
        } catch {
          /* ignore */
        }
      }

      log.epic.debug({ language: userLanguage }, 'Leyendo catálogo de la tienda');
      const catalog = loadShopCatalog(userLanguage);

      if (!catalog) {
        await replyEpicCustomError(interaction, userId, 'gift.errors.shopDataUnavailable');
        return;
      }

      const shopItem = resolveShopCatalogItem(catalog, cosmeticName, { giftableOnly: true });

      if (!shopItem) {
        await replyEpicCustomError(interaction, userId, 'gift.errors.cosmeticNotFound');
        return;
      }

      log.epic.debug(
        { cosmetic: shopItem.number, name: shopItem.name, friend: friendDisplayName },
        'Cosmético encontrado, mostrando confirmación',
      );

      const title = await translateForUser(userId, 'gift.confirm.title', undefined, interaction.locale);
      const confirmDesc = await translateForUser(
        userId,
        'gift.confirm.description',
        { name: shopItem.name, friend: friendDisplayName },
        interaction.locale,
      );
      const typeLabel = await translateForUser(userId, 'gift.confirm.fields.type', undefined, interaction.locale);
      const rarityLabel = await translateForUser(userId, 'gift.confirm.fields.rarity', undefined, interaction.locale);
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
          await translateForUser(userId, 'gift.confirm.footer', undefined, interaction.locale),
        ),
      ].join('\n');

      const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_gift')
        .setLabel(await translateForUser(userId, 'gift.confirm.button', undefined, interaction.locale))
        .setStyle(ButtonStyle.Success);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_gift')
        .setLabel(await translateForUser(userId, 'gift.cancel.button', undefined, interaction.locale))
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
        if (i.customId === 'confirm_gift') {
          await i.deferUpdate();

          try {
            const userDb = await UsuarioInfo.findOne({ id: userId });
            if (!userDb) throw { errorCode: 'no_account' };

            const { account: freshAccount, error: tokenError } = await refreshAccountToken(
              userDb,
              mainAccount.accountId,
            );
            if (tokenError || !freshAccount) {
              await replyEpicCustomError(interaction, userId, 'gift.errors.tokenRefreshFailed');
              return;
            }

            await composeMCP({
              profile: 'common_core',
              operation: 'GiftCatalogEntry',
              accountId: freshAccount.accountId,
              accessToken: freshAccount.accessToken,
              body: {
                offerId: shopItem.offerId,
                currency: 'MtxCurrency',
                currencySubType: '',
                expectedTotalPrice: shopItem.price,
                receiverAccountIds: [friendAccountId],
                giftWrapTemplateId: '',
                personalMessage: '',
              },
            });

            const successTitle = await translateForUser(userId, 'gift.success.title', undefined, interaction.locale);
            const successDesc = await translateForUser(
              userId,
              'gift.success.description',
              { name: shopItem.name, friend: friendDisplayName },
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
            log.epic.error(
              { error: err, cosmetic: cosmeticName, friend: friendDisplayName },
              'Error en regalo MCP',
            );

            if (errorCode === 'errors.com.epicgames.modules.gameplayutils.not_enough_mtx') {
              await replyWithEpicEmbed(interaction, userId, {
                style: 'error',
                description: epicEmojiLine(
                  client,
                  'novbucks',
                  await translateForUser(userId, 'gift.errors.notEnoughVbucks', undefined, interaction.locale),
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
                  await translateForUser(userId, 'gift.errors.alreadyOwned', undefined, interaction.locale),
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
                  await translateForUser(
                    userId,
                    'gift.errors.giftFailed',
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
              description: await translateForUser(userId, 'gift.cancel.description', undefined, interaction.locale),
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
      log.epic.error({ error }, 'Error en comando gift');
      await replyEpicCustomError(interaction, userId, 'gift.errors.unexpected');
    }
  },
};

export default command;
