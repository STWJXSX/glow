/**
 * /logout — remove linked Epic accounts (embedHelper UI, ephemeral).
 */

import {
  ActionRowBuilder,
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
import UsuarioInfo, { type IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { replyAccountCredentialError } from '../account/accountEmbedHelper.ts';
import {
  buildAuthEmbedReply,
  type AuthEmbedInput,
} from './authEmbedHelper.ts';

import {
  AUTH_FLOW_IDLE_MS,
  AUTH_MENU_IDLE_MS,
  AUTH_PROMPT_IDLE_MS,
  isCollectorIdle,
  isCollectorStopped,
} from './authCollectorHelper.ts';

const MAX_SELECT = 25;
const NAV_PREV = 'logout_prev';
const NAV_NEXT = 'logout_next';

function totalPages(count: number): number {
  return Math.ceil(count / MAX_SELECT);
}

function pageSlice<T>(arr: T[], page: number): T[] {
  return arr.slice(page * MAX_SELECT, page * MAX_SELECT + MAX_SELECT);
}

type UserDoc = IUsuarioInfo;

async function buildLogoutPayload(
  userId: string,
  interaction: ChatInputCommandInteraction,
  userDoc: UserDoc | null,
  page: number,
  options: {
    disabled?: boolean;
    note?: string;
    status?: string;
    style?: AuthEmbedInput['style'];
    confirmAll?: boolean;
    confirmCount?: number;
  } = {},
) {
  if (!userDoc?.deviceAuths?.length) {
    const description = [
      options.status,
      await translateForUser(userId, 'logout.success.noAccountsLeft', undefined, interaction.locale),
      options.note,
    ]
      .filter(Boolean)
      .join('\n\n');

    return buildAuthEmbedReply(
      userId,
      {
        style: 'success',
        title: await translateForUser(userId, 'logout.success.allRemovedTitle', undefined, interaction.locale),
        description,
        footerKey: 'brand',
      },
      interaction,
    );
  }

  const count = userDoc.deviceAuths.length;
  const pages = totalPages(count);
  const pageAccounts = pageSlice(userDoc.deviceAuths, page);

  const baseDescription = await translateForUser(
    userId,
    'logout.description',
    { count },
    interaction.locale,
  );

  const description = [options.status, baseDescription, options.note].filter(Boolean).join('\n\n');

  const select = new StringSelectMenuBuilder()
    .setCustomId('logout_select')
    .setPlaceholder(await translateForUser(userId, 'logout.selectPlaceholder', undefined, interaction.locale))
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

  const actions = new ActionRowBuilder<ButtonBuilder>();

  if (pages > 1) {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId(NAV_PREV)
        .setLabel(await translateForUser(userId, 'logout.buttons.previous', undefined, interaction.locale))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(options.disabled || page === 0),
      new ButtonBuilder()
        .setCustomId('logout_page_info')
        .setLabel(`${page + 1}/${pages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(NAV_NEXT)
        .setLabel(await translateForUser(userId, 'logout.buttons.next', undefined, interaction.locale))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(options.disabled || page >= pages - 1),
    );
  }

  if (options.confirmAll) {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId('logout_all_confirm')
        .setLabel(await translateForUser(userId, 'logout.buttons.confirmRemoveAll', undefined, interaction.locale))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(options.disabled),
      new ButtonBuilder()
        .setCustomId('logout_all_cancel')
        .setLabel(await translateForUser(userId, 'logout.buttons.cancel', undefined, interaction.locale))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(options.disabled),
    );
  } else {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId('logout_all')
        .setLabel(await translateForUser(userId, 'logout.buttons.removeAll', undefined, interaction.locale))
        .setStyle(ButtonStyle.Danger)
        .setDisabled(options.disabled),
    );
  }

  rows.push(actions);

  const title = options.confirmAll
    ? await translateForUser(userId, 'logout.confirmAll.title', undefined, interaction.locale)
    : await translateForUser(userId, 'logout.title', undefined, interaction.locale);

  const confirmDescription = options.confirmAll
    ? await translateForUser(
        userId,
        'logout.confirmAll.description',
        { count: options.confirmCount ?? count },
        interaction.locale,
      )
    : description;

  return buildAuthEmbedReply(
    userId,
    {
      style: options.style ?? (options.confirmAll ? 'error' : 'info'),
      title,
      description: options.confirmAll ? confirmDescription : description,
      footerKey: 'brand',
    },
    interaction,
    rows,
  );
}

export async function handleLogoutCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });

    if (!user?.deviceAuths?.length) {
      await replyAccountCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    let page = 0;
    let lastStatus: string | undefined;
    let confirmingAll = false;

    const response = await interaction.editReply(await buildLogoutPayload(userId, interaction, user, page));

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
            await i.update(
              await buildLogoutPayload(userId, interaction, fresh, page, {
                status: lastStatus,
                confirmAll: confirmingAll,
                confirmCount: fresh?.deviceAuths.length,
              }),
            );
            return;
          }
          if (i.customId === NAV_NEXT) {
            const fresh = await UsuarioInfo.findOne({ id: userId });
            if (!fresh) return;
            const pages = totalPages(fresh.deviceAuths.length);
            if (page < pages - 1) {
              page++;
              await i.update(
                await buildLogoutPayload(userId, interaction, fresh, page, {
                  status: lastStatus,
                  confirmAll: confirmingAll,
                  confirmCount: fresh.deviceAuths.length,
                }),
              );
            }
            return;
          }

          if (i.customId === 'logout_all') {
            confirmingAll = true;
            const fresh = await UsuarioInfo.findOne({ id: userId });
            await i.update(
              await buildLogoutPayload(userId, interaction, fresh, page, {
                confirmAll: true,
                confirmCount: fresh?.deviceAuths.length,
              }),
            );
            return;
          }

          if (i.customId === 'logout_all_cancel') {
            confirmingAll = false;
            const fresh = await UsuarioInfo.findOne({ id: userId });
            await i.update(
              await buildLogoutPayload(userId, interaction, fresh, page, { status: lastStatus }),
            );
            return;
          }

          if (i.customId === 'logout_all_confirm') {
            const fresh = await UsuarioInfo.findOne({ id: userId });
            if (!fresh) return;

            const removed = fresh.deviceAuths.length;
            fresh.deviceAuths = [];
            await fresh.save();

            confirmingAll = false;
            lastStatus = await translateForUser(
              userId,
              'logout.success.allRemovedDescription',
              { count: removed },
              interaction.locale,
            );

            await i.update(
              await buildLogoutPayload(userId, interaction, null, 0, {
                status: lastStatus,
                style: 'success',
              }),
            );
            collector.stop('done');
            return;
          }
        }

        if (i.isStringSelectMenu() && i.customId === 'logout_select') {
          const selectedId = i.values[0];
          const fresh = await UsuarioInfo.findOne({ id: userId });
          if (!fresh) return;

          const acc = fresh.deviceAuths.find((a) => a.accountId === selectedId);
          const displayName = acc?.displayName || 'Unknown';
          const wasMain = acc?.cuentaMain === true;

          fresh.deviceAuths = fresh.deviceAuths.filter((a) => a.accountId !== selectedId);
          if (wasMain && fresh.deviceAuths.length > 0) {
            fresh.deviceAuths[0].cuentaMain = true;
          }
          await fresh.save();

          const removedLine = await translateForUser(
            userId,
            'logout.success.removedDescription',
            { displayName, accountId: selectedId },
            interaction.locale,
          );
          const remainingLine = await translateForUser(
            userId,
            'logout.success.remaining',
            { count: fresh.deviceAuths.length },
            interaction.locale,
          );
          lastStatus = `${removedLine}\n${remainingLine}`;

          if (fresh.deviceAuths.length === 0) {
            await i.update(
              await buildLogoutPayload(userId, interaction, null, 0, {
                status: lastStatus,
                style: 'success',
              }),
            );
            collector.stop('done');
            return;
          }

          if (page >= totalPages(fresh.deviceAuths.length)) {
            page = Math.max(0, totalPages(fresh.deviceAuths.length) - 1);
          }

          confirmingAll = false;
          await i.update(
            await buildLogoutPayload(userId, interaction, fresh, page, {
              status: lastStatus,
              style: 'success',
            }),
          );
        }
      } catch (err) {
        log.epic.error({ err }, 'Error in logout collector');
      }
    });

    collector.on('end', async (_, reason) => {
      if (isCollectorStopped(reason, 'done')) return;
      if (!isCollectorIdle(reason)) return;
      try {
        const fresh = await UsuarioInfo.findOne({ id: userId });
        if (!fresh?.deviceAuths?.length) return;

        const note = await translateForUser(userId, 'logout.inactive', undefined, interaction.locale);
        await interaction.editReply(
          await buildLogoutPayload(userId, interaction, fresh, page, {
            disabled: true,
            status: lastStatus,
            note,
          }),
        );
      } catch {
        /* ignore */
      }
    });
  } catch (error) {
    log.epic.error({ error }, 'Error in logout command');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'logout.errors.unexpected', undefined, interaction.locale) },
      interaction,
    );
    try {
      await interaction.editReply({ embeds: [embed], components: [] });
    } catch {
      /* ignore */
    }
  }
}
