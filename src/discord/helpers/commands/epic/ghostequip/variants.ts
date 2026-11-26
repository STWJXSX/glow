import axios from 'axios';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { translateForUser } from '#helpers/locales/index.ts';

export type VariantOption = {
  tag: string;
  name: string;
  image?: string;
};

export type VariantChannel = {
  channel: string;
  name?: string;
  options: VariantOption[];
};

export type CosmeticVariantDetail = {
  id: string;
  name: string;
  variants: VariantChannel[];
};

export type VariantApplyPayload = {
  athenaVariants: Array<{ channel: string; variant: string }>;
  mpIndices: string[];
  previewImage?: string;
};

const detailCache: Record<string, { data: CosmeticVariantDetail; expires: number }> = {};

export async function fetchCosmeticVariantDetail(
  cosmeticId: string,
  language: string,
): Promise<CosmeticVariantDetail | null> {
  const cacheKey = `${language}:${cosmeticId.toLowerCase()}`;
  const cached = detailCache[cacheKey];
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const res = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/${cosmeticId}`, {
      params: { language },
      timeout: 10000,
    });
    const item = res.data?.data;
    if (!item?.id) return null;

    const variants: VariantChannel[] = (item.variants ?? [])
      .filter((v: any) => Array.isArray(v.options) && v.options.length > 0)
      .map((v: any) => ({
        channel: v.channel,
        name: v.name || v.channel,
        options: v.options.map((o: any) => ({
          tag: o.tag,
          name: o.name || o.tag,
          image: o.image,
        })),
      }));

    const detail: CosmeticVariantDetail = {
      id: item.id,
      name: item.name || item.id,
      variants,
    };

    detailCache[cacheKey] = { data: detail, expires: Date.now() + 30 * 60 * 1000 };
    return detail;
  } catch {
    return null;
  }
}

function buildPayload(channels: VariantChannel[], indices: number[]): VariantApplyPayload {
  const athenaVariants = channels.map((ch, i) => ({
    channel: ch.channel,
    variant: ch.options[indices[i]!]?.tag ?? ch.options[0]?.tag ?? 'Stage1',
  }));

  let previewImage: string | undefined;
  for (let i = channels.length - 1; i >= 0; i--) {
    const img = channels[i]?.options[indices[i]!]?.image;
    if (img) {
      previewImage = img;
      break;
    }
  }

  return {
    athenaVariants,
    mpIndices: indices.map(String),
    previewImage,
  };
}

async function promptChannelVariant(
  interaction: ChatInputCommandInteraction,
  userId: string,
  cosmeticName: string,
  channel: VariantChannel,
  channelIndex: number,
  totalChannels: number,
): Promise<number | null> {
  const channelLabel = channel.name || channel.channel;
  const title = await translateForUser(
    userId,
    'ghostequip.variants.pick.title',
    { cosmeticName, channel: channelLabel, step: String(channelIndex + 1), total: String(totalChannels) },
    interaction.locale,
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ghostequip_var_${userId}_${channelIndex}`)
    .setPlaceholder(channelLabel.slice(0, 100))
    .addOptions(
      channel.options.slice(0, 25).map((opt, optionIndex) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.name.slice(0, 100))
          .setDescription(opt.tag.slice(0, 100))
          .setValue(String(optionIndex)),
      ),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.editReply({
    content: title,
    embeds: [],
    components: [row],
    files: [],
  });

  try {
    const selectInteraction = await interaction.fetchReply().then((msg) =>
      msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: (i) =>
          i.user.id === userId
          && i.customId === `ghostequip_var_${userId}_${channelIndex}`,
      }),
    ) as StringSelectMenuInteraction;

    await selectInteraction.deferUpdate();
    return parseInt(selectInteraction.values[0]!, 10);
  } catch {
    return null;
  }
}

/** Prompts variant selects when needed; returns null if the user timed out. */
export async function pickVariantSelections(
  interaction: ChatInputCommandInteraction,
  userId: string,
  detail: CosmeticVariantDetail | null,
): Promise<VariantApplyPayload | null> {
  const allChannels = detail?.variants.filter((ch) => ch.options.length > 0) ?? [];
  if (allChannels.length === 0) {
    return { athenaVariants: [], mpIndices: [], previewImage: undefined };
  }

  const selectedIndices: number[] = [];
  const cosmeticName = detail?.name ?? 'Cosmetic';
  const selectable = allChannels.filter((ch) => ch.options.length > 1);

  for (let i = 0; i < allChannels.length; i++) {
    const ch = allChannels[i]!;
    if (ch.options.length === 1) {
      selectedIndices.push(0);
      continue;
    }

    const stepIndex = selectable.indexOf(ch);
    const picked = await promptChannelVariant(
      interaction,
      userId,
      cosmeticName,
      ch,
      stepIndex,
      selectable.length,
    );
    if (picked === null || Number.isNaN(picked)) return null;
    selectedIndices.push(picked);
  }

  return buildPayload(allChannels, selectedIndices);
}

export function cosmeticIconUrl(cosmeticId: string, previewImage?: string): string {
  return previewImage || `https://fortnite-api.com/images/cosmetics/br/${cosmeticId}/smallicon.png`;
}
