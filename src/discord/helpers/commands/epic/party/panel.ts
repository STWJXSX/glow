import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Message,
  StringSelectMenuBuilder,
} from 'discord.js';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { type AuthorData } from '#helpers/epic/account/avatarHandler.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser, getUserLanguage, type SupportedLanguage } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import type { KickMembersResult, PartyState, RewardsMap } from './types.ts';
import {
  buildEpicEmbed,
  buildEpicReplyPayload,
  getEpicAuthor,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { EPIC_PANEL_IDLE_MS, editMessageInactive, isCollectorIdle } from '../epicCollectorHelper.ts';

const logger = log.commands;

type PanelStatusStyle = 'info' | 'success' | 'warning' | 'error';

interface PanelStatus {
  style: PanelStatusStyle;
  title: string;
  description: string;
  rewards?: string;
  partyDetails?: string;
}

interface PanelAccountContext {
  userId: string;
  userLanguage: SupportedLanguage;
  accountId: string;
  accessToken: string;
  displayName: string;
  authorData: AuthorData | null;
}

interface PanelViewState {
  active: boolean;
  selectedMemberId: string | null;
}

function truncateLabel(value: string, maxLength: number = 100): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatRewardsText(rewards: Record<string, { cantidad: number; emoji: string }>): string {
  const entries = Object.entries(rewards);
  if (entries.length === 0) {
    return '';
  }

  return entries
    .slice(0, 12)
    .map(([name, reward]) => `${reward.emoji} **${name}** x${reward.cantidad}`)
    .join('\n');
}

async function resolvePanelAccountContext(
  interaction: ChatInputCommandInteraction,
  authorData?: AuthorData | null
): Promise<PanelAccountContext | null> {
  const userId = interaction.user.id;
  const user = await UsuarioInfo.findOne({ id: userId });

  if (!user?.deviceAuths?.length) {
    return null;
  }

  const mainAccount = user.deviceAuths.find((account: any) => account.cuentaMain);
  if (!mainAccount) {
    return null;
  }

  const account = mainAccount;

  return {
    userId,
    userLanguage: await getUserLanguage(userId, interaction.locale),
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: account.displayName,
    authorData: authorData ?? await getEpicAuthor(userId, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName,
    }),
  };
}

async function fetchPartyState(context: PanelAccountContext): Promise<PartyState> {
  const party = await callCore<PartyState | null>('party.state', {
    accountId: context.accountId,
    accessToken: context.accessToken,
    displayName: context.displayName,
  });

  if (!party) throw new Error('Party not found');
  return party;
}

async function createPanelEmbed(
  interaction: ChatInputCommandInteraction,
  context: PanelAccountContext,
  party: PartyState,
  selectedMemberId: string | null,
  status?: PanelStatus
) {
  const title = `${getEmoji(interaction.client, 'join')} ${await translateForUser(context.userId, 'party.panel.embed.title')}`;
  const leader = party.members.find((member) => member.isLeader);
  const selectedMember = selectedMemberId ? party.members.find((member) => member.id === selectedMemberId) ?? null : null;
  const otherMembers = party.members.filter((member) => member.id !== context.accountId);
  const youLabel = await translateForUser(context.userId, 'party.panel.labels.you');

  const membersValue = party.members
    .map((member) => {
      const memberEmoji = member.isLeader
        ? getEmoji(interaction.client, 'success')
        : getEmoji(interaction.client, 'active');
      const youSuffix = member.id === context.accountId
        ? ` - ${youLabel}`
        : '';

      return `${memberEmoji} **${member.displayName}**${youSuffix}`;
    })
    .join('\n') || await translateForUser(context.userId, 'party.panel.labels.noMembers');

  const fields = [
    {
      name: await translateForUser(context.userId, 'party.panel.fields.summary'),
      value: [
        `${await translateForUser(context.userId, 'party.panel.fields.account')}: **${context.displayName}**`,
        `${await translateForUser(context.userId, 'party.panel.fields.leader')}: **${leader?.displayName || context.displayName}**`,
        `${await translateForUser(context.userId, 'party.panel.fields.count')}: **${party.size}**`,
        otherMembers.length > 0
          ? `${await translateForUser(context.userId, 'party.panel.fields.manageable')}: **${otherMembers.length}**`
          : `${await translateForUser(context.userId, 'party.panel.fields.manageable')}: **0**`,
      ].join('\n'),
      inline: true,
    },
    {
      name: await translateForUser(context.userId, 'party.panel.fields.members'),
      value: membersValue,
      inline: true,
    },
  ];

  if (selectedMember) {
    fields.push({
      name: await translateForUser(context.userId, 'party.panel.fields.selected'),
      value: `${getEmoji(interaction.client, 'kick')} **${selectedMember.displayName}**`,
      inline: false,
    });
  }

  if (status) {
    fields.unshift({
      name: status.title,
      value: status.description,
      inline: false,
    });

    if (status.partyDetails) {
      fields.push({
        name: await translateForUser(context.userId, 'party.kick.collectall.fields.membersKicked'),
        value: status.partyDetails,
        inline: false,
      });
    }

    if (status.rewards) {
      fields.push({
        name: await translateForUser(context.userId, 'party.kick.collect.fields.rewards'),
        value: status.rewards,
        inline: false,
      });
    }
  }

  const description = await translateForUser(context.userId, 'party.panel.embed.description', {
    rewardsEmoji: getEmoji(interaction.client, 'rewards'),
    kickEmoji: getEmoji(interaction.client, 'kick'),
    leaveEmoji: getEmoji(interaction.client, 'leave'),
  });

  const embedFactory = status?.style === 'success'
    ? 'success'
    : status?.style === 'warning'
      ? 'warning'
      : status?.style === 'error'
        ? 'error'
        : 'info';

  return buildEpicEmbed(context.userId, {
    style: embedFactory,
    title,
    description,
    fields,
    author: context.authorData,
    timestamp: true,
  }, interaction);
}

async function createPanelComponents(
  interaction: ChatInputCommandInteraction,
  context: PanelAccountContext,
  party: PartyState,
  sessionPrefix: string,
  selectedMemberId: string | null,
) {
  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];
  const isLeader = party.members.find((member) => member.id === context.accountId)?.isLeader ?? false;
  const otherMembers = party.members.filter((member) => member.id !== context.accountId);
  const selectedMember = selectedMemberId ? party.members.find((member) => member.id === selectedMemberId) ?? null : null;
  const selectDescription = await translateForUser(context.userId, 'party.panel.select.description');

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${sessionPrefix}:leave`)
        .setLabel(await translateForUser(context.userId, 'party.panel.buttons.leave'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${sessionPrefix}:kick_collect`)
        .setLabel(await translateForUser(context.userId, 'party.panel.buttons.kickCollect'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${sessionPrefix}:kick_all_collect`)
        .setLabel(await translateForUser(context.userId, 'party.panel.buttons.kickAllCollect'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${sessionPrefix}:claim_rewards`)
        .setLabel(await translateForUser(context.userId, 'party.panel.buttons.claimRewards'))
        .setStyle(ButtonStyle.Success)
    )
  );

  if (isLeader && otherMembers.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${sessionPrefix}:member_select`)
          .setPlaceholder(await translateForUser(context.userId, 'party.panel.select.placeholder'))
          .addOptions(
            otherMembers.map((member) => ({
              label: truncateLabel(member.displayName),
              description: truncateLabel(selectDescription),
              value: member.id,
              default: member.id === selectedMemberId,
            }))
          )
      )
    );
  }

  if (isLeader && selectedMember) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${sessionPrefix}:kick_member`)
          .setLabel(await translateForUser(context.userId, 'party.panel.buttons.kickMember'))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${sessionPrefix}:promote_member`)
          .setLabel(await translateForUser(context.userId, 'party.panel.buttons.promoteMember'))
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  return components;
}

async function renderPanel(
  interaction: ChatInputCommandInteraction,
  message: Message,
  authorData: AuthorData | null,
  sessionPrefix: string,
  selectedMemberId: string | null,
  status?: PanelStatus
): Promise<PanelViewState> {
  const context = await resolvePanelAccountContext(interaction, authorData);

  if (!context) {
    const embed = await buildEpicEmbed(interaction.user.id, {
      style: 'error',
      title: await translateEpic(interaction.client, interaction.user.id, 'party.autokick.activar.errors.noMain.title', 'error'),
      description: await translateForUser(interaction.user.id, 'party.autokick.activar.errors.noMain.description'),
      author: authorData,
    }, interaction);

    await message.edit({ embeds: [embed], components: [] });
    return { active: false, selectedMemberId: null };
  }

  try {
    const party = await fetchPartyState(context);
    const normalizedSelection = selectedMemberId && party.members.some((member) => member.id === selectedMemberId)
      ? selectedMemberId
      : null;
    const embed = await createPanelEmbed(interaction, context, party, normalizedSelection, status);
    const components = await createPanelComponents(interaction, context, party, sessionPrefix, normalizedSelection);

    await message.edit({ embeds: [embed], components });
    return { active: true, selectedMemberId: normalizedSelection };
  } catch (error: any) {
    const isNoParty = error?.message === 'Party not found';
    const embed = isNoParty
      ? await buildEpicEmbed(interaction.user.id, {
          style: 'warning',
          title: await translateEpic(interaction.client, interaction.user.id, 'party.kick.normal.embed.noParty.title', 'warning'),
          description: await translateForUser(interaction.user.id, 'party.kick.normal.embed.noParty.description', {
            displayName: context.displayName,
          }),
          author: context.authorData,
        }, interaction)
      : await buildEpicEmbed(interaction.user.id, {
          style: 'error',
          title: await translateEpic(interaction.client, interaction.user.id, 'party.panel.errors.unexpectedTitle', 'error'),
          description: await translateForUser(interaction.user.id, 'party.panel.errors.unexpectedDescription'),
          author: context.authorData,
        }, interaction);

    await message.edit({ embeds: [embed], components: [] });
    return { active: false, selectedMemberId: null };
  }
}

async function buildKickMemberStatus(
  interaction: ChatInputCommandInteraction,
  userId: string,
  memberName: string,
): Promise<PanelStatus> {
  return {
    style: 'success',
    title: `${getEmoji(interaction.client, 'success')} ${await translateForUser(userId, 'party.panel.status.memberKicked.title')}`,
    description: await translateForUser(userId, 'party.panel.status.memberKicked.description', { memberName }),
  };
}

async function buildClaimStatus(
  interaction: ChatInputCommandInteraction,
  userId: string,
  rewards: Record<string, { cantidad: number; emoji: string }>,
): Promise<PanelStatus> {
  const hasRewards = Object.keys(rewards).length > 0;

  return {
    style: hasRewards ? 'success' : 'warning',
    title: `${hasRewards ? getEmoji(interaction.client, 'success') : getEmoji(interaction.client, 'warning')} ${await translateForUser(userId, hasRewards ? 'party.panel.status.claimedRewards.title' : 'party.panel.status.noRewards.title')}`,
    description: await translateForUser(userId, hasRewards ? 'party.panel.status.claimedRewards.description' : 'party.panel.status.noRewards.description'),
    rewards: hasRewards ? formatRewardsText(rewards) : undefined,
  };
}

export async function handlePartyPanelSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const initialContext = await resolvePanelAccountContext(interaction);

  if (!initialContext) {
    const payload = await buildEpicReplyPayload(interaction.user.id, {
      style: 'error',
      title: await translateEpic(interaction.client, interaction.user.id, 'party.autokick.activar.errors.noMain.title', 'error'),
      description: await translateForUser(interaction.user.id, 'party.autokick.activar.errors.noMain.description'),
    }, interaction);

    await interaction.editReply(payload);
    return;
  }

  const sessionPrefix = `party_panel:${interaction.id}`;
  const initialPayload = await buildEpicReplyPayload(interaction.user.id, {
    style: 'info',
    title: await translateEpic(interaction.client, interaction.user.id, 'party.panel.embed.loadingTitle', 'loading'),
    description: await translateForUser(interaction.user.id, 'party.panel.embed.loadingDescription'),
    author: initialContext.authorData,
    loading: true,
  }, interaction);

  await interaction.editReply({ ...initialPayload, components: [] });

  const message = await interaction.fetchReply() as Message;
  const initialView = await renderPanel(
    interaction,
    message,
    initialContext.authorData,
    sessionPrefix,
    null,
  );

  if (!initialView.active) {
    return;
  }

  let selectedMemberId = initialView.selectedMemberId;
  let closed = false;

  const collector = message.createMessageComponentCollector({ idle: EPIC_PANEL_IDLE_MS });

  collector.on('collect', async (componentInteraction) => {
    if (!componentInteraction.customId.startsWith(sessionPrefix)) {
      return;
    }

    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({
        content: await translateForUser(interaction.user.id, 'party.panel.errors.notYourPanel'),
        ephemeral: true,
      }).catch(() => null);
      return;
    }

    await componentInteraction.deferUpdate().catch(() => null);

    try {
      if (componentInteraction.isStringSelectMenu()) {
        selectedMemberId = componentInteraction.values[0] || null;
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          selectedMemberId,
        );
        selectedMemberId = refreshedView.selectedMemberId;
        if (!refreshedView.active) {
          closed = true;
          collector.stop('closed');
        }
        return;
      }

      const context = await resolvePanelAccountContext(interaction, initialContext.authorData);
      if (!context) {
        closed = true;
        collector.stop('closed');
        await renderPanel(interaction, message, initialContext.authorData, sessionPrefix, null, {
          style: 'error',
          title: `${getEmoji(interaction.client, 'error')} ${await translateForUser(interaction.user.id, 'party.panel.errors.unexpectedTitle')}`,
          description: await translateForUser(interaction.user.id, 'party.panel.errors.unexpectedDescription'),
        });
        return;
      }

      const action = componentInteraction.customId.slice(sessionPrefix.length + 1);

      if (action === 'leave') {
        await callCore('party.leave', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });
        closed = true;
        collector.stop('completed');

        const embed = await buildEpicEmbed(interaction.user.id, {
          style: 'success',
          title: await translateEpic(interaction.client, interaction.user.id, 'party.kick.normal.embed.success.title', 'success'),
          description: await translateForUser(interaction.user.id, 'party.kick.normal.embed.success.description', {
            displayName: context.displayName,
          }),
          author: context.authorData,
        }, interaction);

        await message.edit({ embeds: [embed], components: [] });
        return;
      }

      if (action === 'kick_collect') {
        const rewards = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          language: context.userLanguage,
        });
        const rewardLines = formatRewardsText(rewards);
        await callCore('party.leave', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });

        closed = true;
        collector.stop('completed');

        const hasRewards = Object.keys(rewards).length > 0;
        const embed = await buildEpicEmbed(interaction.user.id, {
          style: 'success',
          title: await translateEpic(
            interaction.client,
            interaction.user.id,
            `party.kick.collect.embed.${hasRewards ? 'successWithRewards' : 'noRewards'}.title`,
            'success',
          ),
          description: await translateForUser(interaction.user.id, `party.kick.collect.embed.${hasRewards ? 'successWithRewards' : 'noRewards'}.description`, {
            displayName: context.displayName,
          }),
          fields: rewardLines
            ? [{
                name: await translateForUser(interaction.user.id, 'party.kick.collect.fields.rewards'),
                value: rewardLines,
                inline: false,
              }]
            : undefined,
          author: context.authorData,
        }, interaction);

        await message.edit({ embeds: [embed], components: [] });
        return;
      }

      if (action === 'kick_all_collect') {
        const kickResult = await callCoreWithTimeout<KickMembersResult>('party.kickMembers', 5 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });
        const isLeader = kickResult.isLeader;
        const kickedCount = kickResult.kickedCount;
        const kickedNames = kickResult.kickedNames;

        const rewards = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          language: context.userLanguage,
        });
        await callCore('party.leave', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
        });

        closed = true;
        collector.stop('completed');

        const hasRewards = Object.keys(rewards).length > 0;
        const fields = [] as Array<{ name: string; value: string; inline?: boolean }>;
        fields.push({
          name: await translateForUser(interaction.user.id, 'party.kick.collectall.fields.membersKicked'),
          value: isLeader
            ? await translateForUser(interaction.user.id, 'party.kick.collectall.fields.kickedCount', { count: kickedCount })
            : await translateForUser(interaction.user.id, 'party.kick.collectall.fields.notLeader'),
          inline: false,
        });

        if (kickedNames.length > 0) {
          fields.push({
            name: await translateForUser(interaction.user.id, 'party.panel.fields.kickedMembers'),
            value: kickedNames.join('\n'),
            inline: false,
          });
        }

        const rewardLines = formatRewardsText(rewards);
        if (rewardLines) {
          fields.push({
            name: await translateForUser(interaction.user.id, 'party.kick.collect.fields.rewards'),
            value: rewardLines,
            inline: false,
          });
        }

        const embed = await buildEpicEmbed(interaction.user.id, {
          style: 'success',
          title: await translateEpic(
            interaction.client,
            interaction.user.id,
            `party.kick.collect.embed.${hasRewards ? 'successWithRewards' : 'noRewards'}.title`,
            'success',
          ),
          description: await translateForUser(interaction.user.id, `party.kick.collect.embed.${hasRewards ? 'successWithRewards' : 'noRewards'}.description`, {
            displayName: context.displayName,
          }),
          fields,
          author: context.authorData,
        }, interaction);

        await message.edit({ embeds: [embed], components: [] });
        return;
      }

      if (action === 'claim_rewards') {
        const rewards = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          language: context.userLanguage,
        });
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          selectedMemberId,
          await buildClaimStatus(interaction, interaction.user.id, rewards),
        );
        selectedMemberId = refreshedView.selectedMemberId;
        if (!refreshedView.active) {
          closed = true;
          collector.stop('closed');
        }
        return;
      }

      const party = await callCore<PartyState | null>('party.state', {
        accountId: context.accountId,
        accessToken: context.accessToken,
        displayName: context.displayName,
      });

      if (!party) throw new Error('Party not found');

      const isLeader = party.members.find((member) => member.id === context.accountId)?.isLeader ?? false;

      if (!isLeader) {
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          null,
          {
            style: 'warning',
            title: `${getEmoji(interaction.client, 'warning')} ${await translateForUser(interaction.user.id, 'party.panel.status.notLeader.title')}`,
            description: await translateForUser(interaction.user.id, 'party.panel.status.notLeader.description'),
          },
        );
        selectedMemberId = refreshedView.selectedMemberId;
        return;
      }

      if (!selectedMemberId) {
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          null,
          {
            style: 'warning',
            title: `${getEmoji(interaction.client, 'warning')} ${await translateForUser(interaction.user.id, 'party.panel.status.noSelection.title')}`,
            description: await translateForUser(interaction.user.id, 'party.panel.status.noSelection.description'),
          },
        );
        selectedMemberId = refreshedView.selectedMemberId;
        return;
      }

      const targetMember = party.members.find((member) => member.id === selectedMemberId);
      if (!targetMember) {
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          null,
          {
            style: 'warning',
            title: `${getEmoji(interaction.client, 'warning')} ${await translateForUser(interaction.user.id, 'party.panel.status.memberGone.title')}`,
            description: await translateForUser(interaction.user.id, 'party.panel.status.memberGone.description'),
          },
        );
        selectedMemberId = refreshedView.selectedMemberId;
        return;
      }

      if (action === 'kick_member') {
        const memberName = targetMember.displayName;
        await callCore('party.kickMember', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          memberId: selectedMemberId,
        });
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          null,
          await buildKickMemberStatus(interaction, interaction.user.id, memberName),
        );
        selectedMemberId = refreshedView.selectedMemberId;
        return;
      }

      if (action === 'promote_member') {
        const memberName = targetMember.displayName;
        await callCore('party.promoteMember', {
          accountId: context.accountId,
          accessToken: context.accessToken,
          displayName: context.displayName,
          memberId: selectedMemberId,
        });
        const refreshedView = await renderPanel(
          interaction,
          message,
          initialContext.authorData,
          sessionPrefix,
          null,
          {
            style: 'success',
            title: await translateForUser(interaction.user.id, 'promote.success.title', {
              emoji: getEmoji(interaction.client, 'success'),
            }),
            description: await translateForUser(interaction.user.id, 'promote.success.description', {
              memberName,
            }),
          },
        );
        selectedMemberId = refreshedView.selectedMemberId;
      }
    } catch (error) {
      logger.error({ error }, '[partyPanel] Error processing interaction');

      const refreshedView = await renderPanel(
        interaction,
        message,
        initialContext.authorData,
        sessionPrefix,
        selectedMemberId,
        {
          style: 'error',
          title: `${getEmoji(interaction.client, 'error')} ${await translateForUser(interaction.user.id, 'party.panel.errors.unexpectedTitle')}`,
          description: await translateForUser(interaction.user.id, 'party.panel.errors.unexpectedDescription'),
        },
      );

      if (!refreshedView.active) {
        closed = true;
        collector.stop('closed');
        return;
      }

      selectedMemberId = refreshedView.selectedMemberId;
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (closed) return;
    if (!isCollectorIdle(reason)) return;

    try {
      const inactiveNote = await translateForUser(interaction.user.id, 'epic.inactivePanel', undefined, interaction.locale);
      await editMessageInactive(message, inactiveNote);
    } catch {
      await message.edit({ components: [] }).catch(() => null);
    }
  });
}
