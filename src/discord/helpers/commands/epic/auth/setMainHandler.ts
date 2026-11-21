/**
 * /switch and /set-main — pick active Epic account (author shows selection).
 */

import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import UsuarioInfo, { type IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { replyAccountCredentialError } from '../account/accountEmbedHelper.ts';
import {
  buildAuthEmbedReply,
  replyWithAuthEmbed,
} from './authEmbedHelper.ts';
import { stripAutocompleteLabel } from '../epicEmbedHelper.ts';

import {
  AUTH_MENU_IDLE_MS,
  isCollectorIdle,
} from './authCollectorHelper.ts';

const MAX_SELECT = 25;
const MAX_AUTOCOMPLETE = 25;
const SENTINEL_NONE = '__none__';
const SENTINEL_NOMATCH = '__nomatch__';
const NAV_PREV = 'setmain_prev';
const NAV_NEXT = 'setmain_next';

function totalPages(count: number): number {
  return Math.ceil(count / MAX_SELECT);
}

function pageSlice<T>(arr: T[], page: number): T[] {
  return arr.slice(page * MAX_SELECT, page * MAX_SELECT + MAX_SELECT);
}

type UserDoc = IUsuarioInfo;
type DeviceAuth = UserDoc['deviceAuths'][number];

function filterAccountsByQuery(accounts: DeviceAuth[], query: string): DeviceAuth[] {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? accounts.filter(
        (acc) =>
          (acc.displayName?.toLowerCase().includes(q) ?? false) ||
          acc.accountId.toLowerCase().includes(q),
      )
    : [...accounts];

  return filtered
    .sort((a, b) => {
      if (a.cuentaMain !== b.cuentaMain) return a.cuentaMain ? -1 : 1;
      return (a.displayName ?? a.accountId).localeCompare(b.displayName ?? b.accountId);
    })
    .slice(0, MAX_AUTOCOMPLETE);
}

async function getAccountAuthor(userId: string, acc: DeviceAuth) {
  return getMainAccountAuthor(userId, {
    accountId: acc.accountId,
    accessToken: acc.accessToken,
    displayName: acc.displayName,
  });
}

export async function handleSetMainAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const userId = interaction.user.id;
  const query = interaction.options.getFocused(true).value;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    const accounts = user?.deviceAuths ?? [];

    if (!accounts.length) {
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(userId, 'setMain.autocomplete.noAccounts', undefined, interaction.locale),
          ),
          value: SENTINEL_NONE,
        },
      ]);
      return;
    }

    const mainTag = await translateForUser(userId, 'setMain.autocomplete.mainTag', undefined, interaction.locale);
    const filtered = filterAccountsByQuery(accounts, query);

    if (!filtered.length) {
      await interaction.respond([
        {
          name: stripAutocompleteLabel(
            await translateForUser(userId, 'setMain.autocomplete.noMatch', undefined, interaction.locale),
          ),
          value: SENTINEL_NOMATCH,
        },
      ]);
      return;
    }

    await interaction.respond(
      filtered.map((acc) => {
        const base = acc.displayName || acc.accountId;
        const label = acc.cuentaMain ? `${base} (${mainTag})` : base;
        return {
          name: stripAutocompleteLabel(label).slice(0, 100),
          value: acc.accountId,
        };
      }),
    );
  } catch (err) {
    log.epic.error({ err }, 'set-main autocomplete error');
    await interaction.respond([]).catch(() => {});
  }
}

export async function handleSetMainDirectCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const selectedId = interaction.options.getString('account', true);

  if (selectedId === SENTINEL_NONE || selectedId === SENTINEL_NOMATCH) {
    await replyAccountCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  try {
    const user = await UsuarioInfo.findOne({ id: userId });

    if (!user?.deviceAuths?.length) {
      await replyAccountCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const acc = user.deviceAuths.find((a) => a.accountId === selectedId);
    if (!acc) {
      const embed = await createGenericErrorEmbed(
        { message: await translateForUser(userId, 'setMain.errors.notFound', undefined, interaction.locale) },
        interaction,
      );
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    const author = await getAccountAuthor(userId, acc);

    if (acc.cuentaMain) {
      await replyWithAuthEmbed(interaction, userId, {
        style: 'info',
        description: await translateForUser(
          userId,
          'setMain.alreadyMain',
          { displayName: acc.displayName || acc.accountId },
          interaction.locale,
        ),
        author,
        footerKey: 'brand',
      });
      return;
    }

    user.deviceAuths.forEach((a) => {
      a.cuentaMain = a.accountId === selectedId;
    });
    await user.save();

    await replyWithAuthEmbed(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'setMain.successTitle', undefined, interaction.locale),
      description: await translateForUser(
        userId,
        'setMain.successDesc',
        { displayName: acc.displayName || acc.accountId },
        interaction.locale,
      ),
      author,
      footerKey: 'brand',
    });
  } catch (error) {
    log.epic.error({ error }, 'Error in set-main command');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'setMain.errors.unexpected', undefined, interaction.locale) },
      interaction,
    );
    try {
      await interaction.editReply({ embeds: [embed], components: [] });
    } catch {
      /* ignore */
    }
  }
}

async function buildSetMainPayload(
  userId: string,
  interaction: ChatInputCommandInteraction,
  userDoc: UserDoc,
  page: number,
  options: { disabled?: boolean; note?: string } = {},
) {
  const mainAcc = userDoc.deviceAuths.find((a) => a.cuentaMain);
  const author = mainAcc
    ? await getMainAccountAuthor(userId, {
        accountId: mainAcc.accountId,
        accessToken: mainAcc.accessToken,
        displayName: mainAcc.displayName,
      })
    : null;

  let description = await translateForUser(userId, 'setMain.description', undefined, interaction.locale);
  if (options.note) {
    description = `${description}\n\n${options.note}`;
  }

  const pages = totalPages(userDoc.deviceAuths.length);
  const pageAccounts = pageSlice(userDoc.deviceAuths, page);

  const select = new StringSelectMenuBuilder()
    .setCustomId('setmain_select')
    .setPlaceholder(await translateForUser(userId, 'setMain.selectPlaceholder', undefined, interaction.locale))
    .setDisabled(options.disabled ?? false)
    .addOptions(
      pageAccounts.map((acc) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(acc.displayName || 'Unknown')
          .setDescription(acc.accountId)
          .setValue(acc.accountId),
      ),
    );

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  ];

  if (pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(NAV_PREV)
          .setLabel(await translateForUser(userId, 'setMain.buttons.previous', undefined, interaction.locale))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(options.disabled || page === 0),
        new ButtonBuilder()
          .setCustomId('setmain_page_info')
          .setLabel(`${page + 1}/${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(NAV_NEXT)
          .setLabel(await translateForUser(userId, 'setMain.buttons.next', undefined, interaction.locale))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(options.disabled || page >= pages - 1),
      ),
    );
  }

  return buildAuthEmbedReply(
    userId,
    {
      style: 'info',
      description,
      author,
      footerKey: 'brand',
    },
    interaction,
    rows,
  );
}

export async function handleSetMainCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });

    if (!user?.deviceAuths?.length) {
      await replyAccountCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    if (user.deviceAuths.length === 1) {
      const acc = user.deviceAuths[0];
      if (!acc.cuentaMain) {
        acc.cuentaMain = true;
        await user.save();
      }
      const author = await getMainAccountAuthor(userId, {
        accountId: acc.accountId,
        accessToken: acc.accessToken,
        displayName: acc.displayName,
      });
      await replyWithAuthEmbed(interaction, userId, {
        style: 'info',
        description: await translateForUser(userId, 'setMain.onlyOne', undefined, interaction.locale),
        author,
        footerKey: 'brand',
      });
      return;
    }

    let page = 0;

    const response = await interaction.editReply(await buildSetMainPayload(userId, interaction, user, page));

    const collector = response.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      idle: AUTH_MENU_IDLE_MS,
    });

    collector.on('collect', async (i: StringSelectMenuInteraction | ButtonInteraction) => {
      try {
        if (i.isButton()) {
          if (i.customId === NAV_PREV && page > 0) {
            page--;
            const fresh = await UsuarioInfo.findOne({ id: userId });
            if (!fresh) return;
            await i.update(await buildSetMainPayload(userId, interaction, fresh, page));
            return;
          }
          if (i.customId === NAV_NEXT) {
            const fresh = await UsuarioInfo.findOne({ id: userId });
            if (!fresh) return;
            const pages = totalPages(fresh.deviceAuths.length);
            if (page < pages - 1) {
              page++;
              await i.update(await buildSetMainPayload(userId, interaction, fresh, page));
            }
            return;
          }
        }

        if (i.isStringSelectMenu() && i.customId === 'setmain_select') {
          const selectedId = i.values[0];
          const fresh = await UsuarioInfo.findOne({ id: userId });
          if (!fresh) return;

          fresh.deviceAuths.forEach((acc) => {
            acc.cuentaMain = acc.accountId === selectedId;
          });
          await fresh.save();

          await i.update(await buildSetMainPayload(userId, interaction, fresh, page));
        }
      } catch (err) {
        log.epic.error({ err }, 'Error in set-main collector');
      }
    });

    collector.on('end', async (_, reason) => {
      if (!isCollectorIdle(reason)) return;
      try {
        const fresh = await UsuarioInfo.findOne({ id: userId });
        if (!fresh?.deviceAuths?.length) return;

        const note = await translateForUser(userId, 'setMain.inactive', undefined, interaction.locale);
        await interaction.editReply(await buildSetMainPayload(userId, interaction, fresh, page, {
          disabled: true,
          note,
        }));
      } catch {
        /* ignore */
      }
    });
  } catch (error) {
    log.epic.error({ error }, 'Error in set-main command');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'setMain.errors.unexpected', undefined, interaction.locale) },
      interaction,
    );
    try {
      await interaction.editReply({ embeds: [embed], components: [] });
    } catch {
      /* ignore */
    }
  }
}
