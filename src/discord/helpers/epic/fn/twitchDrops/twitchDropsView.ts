/**
 * Twitch Drops — presentation shared by the feed (core monitor) and /twitchdrops.
 * Data comes from the core already normalized (see DropCampaign).
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from 'discord.js';
import { translate, type SupportedLanguage } from '#helpers/locales/index.ts';

export const TWITCH_DROPS_FEED_TYPE = 'twitchdrops' as const;
/** Fortnite's category id on Twitch. */
export const FORTNITE_TWITCH_GAME_ID = '33214';

const TWITCH_PURPLE = 0x9146ff;
const TWITCH_LOGO_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Twitch_Glitch_Logo_Purple.svg/250px-Twitch_Glitch_Logo_Purple.svg.png';
/** A message holds at most 40 components; every reward with image costs 3 (section + text + thumbnail). */
const MAX_REWARDS_SHOWN = 8;
const MAX_LIVE_CHANNELS = 3;

export interface DropReward {
  id: string;
  name: string;
  imageUrl: string | null;
  /** Minutes of watch time required (0 when the drop is sub/event based). */
  minutes: number;
  /** Subscriptions required (0 when none). */
  subs: number;
}

export interface DropCampaign {
  id: string;
  name: string;
  gameId: string;
  gameName: string;
  description: string | null;
  imageUrl: string | null;
  boxArtUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  ownerName: string | null;
  accountLinkUrl: string | null;
  detailsUrl: string | null;
  webUrl: string | null;
  rewards: DropReward[];
  /** Streamers allowed to grant the drops; null when any streamer in the category can. */
  allowedChannels: string[] | null;
  liveChannels: { login: string; name: string; viewers: number }[];
}

export type DropsView = 'new' | 'added' | 'info';

const tr = (lang: SupportedLanguage, key: string, vars?: Record<string, string | number>) =>
  translate(`twitchDrops.${key}`, lang, vars);

const KIND_KEY: Record<DropsView, string> = {
  new: 'new',
  added: 'added',
  info: 'active',
};

const ts = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

function formatWatchTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

function rewardLine(reward: DropReward, lang: SupportedLanguage): string {
  const requirement = reward.subs > 0
    ? tr(lang, 'subs', { count: reward.subs })
    : reward.minutes > 0
      ? tr(lang, 'watch', { time: formatWatchTime(reward.minutes) })
      : null;
  return requirement ? `**${reward.name}**\n-# ${requirement}` : `**${reward.name}**`;
}

function safeUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * One campaign as a Components V2 container: banner, dates, rewards with their image and links.
 * `rewards` limits which drops are listed (used when only new drops were added to a known campaign).
 */
export function buildDropCampaignContainer(
  campaign: DropCampaign,
  lang: SupportedLanguage,
  view: DropsView = 'info',
  rewards: DropReward[] = campaign.rewards,
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(TWITCH_PURPLE);

  const start = ts(campaign.startAt);
  const end = ts(campaign.endAt);
  const header = [
    `-# ${tr(lang, KIND_KEY[view])}`,
    `## ${campaign.name}`,
    campaign.description ? `-# ${campaign.description.replace(/\s+/g, ' ').slice(0, 200)}` : null,
  ].filter((l): l is string => l !== null).join('\n');

  const dates = [
    start ? `> __${tr(lang, 'starts')}__: <t:${start}:f>` : null,
    end ? `> __${tr(lang, 'ends')}__: <t:${end}:f> (<t:${end}:R>)` : null,
  ].filter((l): l is string => l !== null);

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([header, ...dates].join('\n')))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(TWITCH_LOGO_URL)),
  );

  const banner = safeUrl(campaign.imageUrl);
  if (banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### __${tr(lang, 'rewards')}__ (${rewards.length})`),
  );

  for (const reward of rewards.slice(0, MAX_REWARDS_SHOWN)) {
    const text = new TextDisplayBuilder().setContent(rewardLine(reward, lang));
    const image = safeUrl(reward.imageUrl);
    if (image) {
      container.addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(text).setThumbnailAccessory(new ThumbnailBuilder().setURL(image)),
      );
    } else {
      container.addTextDisplayComponents(text);
    }
  }
  if (rewards.length > MAX_REWARDS_SHOWN) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${tr(lang, 'more', { count: rewards.length - MAX_REWARDS_SHOWN })}`),
    );
  }

  // Who can grant the drops
  const live = campaign.liveChannels.slice(0, MAX_LIVE_CHANNELS)
    .map((c) => `[\`${c.name}\`](https://www.twitch.tv/${encodeURIComponent(c.login)}) · ${c.viewers}`);
  const who = campaign.allowedChannels === null
    ? tr(lang, 'anyChannel')
    : tr(lang, 'selectedChannels', { count: campaign.allowedChannels.length });
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    [`-# ${who}`, live.length ? `__${tr(lang, 'liveNow')}__: ${live.join('  ')}` : null]
      .filter((l): l is string => l !== null).join('\n'),
  ));

  const buttons = [
    [tr(lang, 'linkAccount'), safeUrl(campaign.accountLinkUrl)],
    [tr(lang, 'dropsPage'), safeUrl(campaign.webUrl)],
  ].filter((b): b is [string, string] => b[1] !== null);
  if (buttons.length) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons.map(([label, url]) => new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link)),
      ),
    );
  }

  return container;
}

export function buildDropCampaignMessage(
  campaign: DropCampaign,
  lang: SupportedLanguage,
  view: DropsView = 'info',
  rewards?: DropReward[],
) {
  return {
    components: [buildDropCampaignContainer(campaign, lang, view, rewards)],
    flags: MessageFlags.IsComponentsV2,
  } as const;
}

export function buildNoDropsContainer(lang: SupportedLanguage): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(TWITCH_PURPLE)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Twitch Drops\n${tr(lang, 'none')}`));
}
