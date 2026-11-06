import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import axios from 'axios';
import { callCore } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import {
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { editFakeReply, fakeSuccessDescription } from './fakeReply.ts';

interface JamTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  albumArt: string;
}

const INSTRUMENT_SUFFIX: Record<string, string> = {
  drums: 'Drum',
  guitar: 'Lead',
  bass: 'Bass',
  vocals: 'Vox',
  plasticBass: 'ProBass',
};

let tracksCache: Record<string, JamTrack[]> = {};
let tracksCacheExpiry: Record<string, number> = {};

async function getTracks(apiLang: string): Promise<JamTrack[]> {
  if (tracksCache[apiLang]?.length && Date.now() < (tracksCacheExpiry[apiLang] || 0)) {
    return tracksCache[apiLang];
  }

  try {
    const res = await axios.get('https://fortnite-api.com/v2/cosmetics/tracks', {
      params: { language: apiLang },
      timeout: 10000,
    });
    if (res.data?.status === 200 && Array.isArray(res.data.data)) {
      tracksCache[apiLang] = (res.data.data as any[])
        .map((t) => ({
          id: t.id as string,
          title: (t.title || t.devName || t.id) as string,
          artist: (t.artist || '') as string,
          bpm: (t.bpm || 120) as number,
          albumArt: (t.albumArt || '') as string,
        }))
        .filter((t) => !!t.id)
        .sort((a, b) => a.title.localeCompare(b.title));

      tracksCacheExpiry[apiLang] = Date.now() + 30 * 60 * 1000;
    }
  } catch (e: any) {
    log.epic.error('[GHOST EQUIP MUSIC] Error fetching tracks:', e.message);
  }

  return tracksCache[apiLang] ?? [];
}

function buildSongPartPath(trackId: string, instrumentSuffix: string): string {
  let partName: string;

  const placeholderMatch = trackId.match(/^sid_placeholder_(\d+)$/i);
  if (placeholderMatch) {
    partName = `Placeholder_${placeholderMatch[1]}`;
  } else {
    const stripped = trackId.replace(/^sid_/i, '');
    partName = stripped
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  const assetName = `SparksSongPart_${partName}_${instrumentSuffix}`;
  return `/SparksSongTemplates/Items/SongParts/${assetName}.${assetName}`;
}

export async function handleMusicAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== 'cancion' && focusedOption.name !== 'song') return;

  try {
    const apiLang = await getFortniteApiLanguageCode(interaction.user.id, interaction.locale);
    const tracks = await getTracks(apiLang);
    const query = focusedOption.value.toLowerCase();

    const filtered = query
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(query) ||
            t.artist.toLowerCase().includes(query),
        )
      : tracks;

    await interaction.respond(
      filtered.slice(0, 25).map((t) => ({
        name: `${t.title} — ${t.artist} (${t.bpm} BPM)`.slice(0, 100),
        value: `${t.id}:${t.bpm}`,
      })),
    );
  } catch {
    await interaction.respond([]);
  }
}

export async function handleMusic(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const user = await UsuarioInfo.findOne({ id: userId });
  const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

  try {
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId);
    const trackRaw = interaction.options.getString('cancion', true);
    const instrumentKey = interaction.options.getString('instrumento', true);
    const tempoOverride = interaction.options.getInteger('tempo') ?? null;

    const colonIdx = trackRaw.lastIndexOf(':');
    const trackId = colonIdx > 0 ? trackRaw.slice(0, colonIdx) : trackRaw;
    const trackBpm = colonIdx > 0 ? parseInt(trackRaw.slice(colonIdx + 1), 10) : 120;
    const finalTempo = tempoOverride ?? (Number.isNaN(trackBpm) ? 120 : trackBpm);

    const instrumentSuffix = INSTRUMENT_SUFFIX[instrumentKey] ?? 'Drum';
    const songPartPath = buildSongPartPath(trackId, instrumentSuffix);

    await callCore('fake.music', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      songPartPath,
      tempo: finalTempo,
    });

    const apiLang = await getFortniteApiLanguageCode(userId, interaction.locale);
    const tracks = await getTracks(apiLang);
    const track = tracks.find((t) => t.id === trackId);
    const trackDisplay = track ? `${track.title} — ${track.artist}` : trackId;
    const instrumentDisplay = await translateForUser(
      userId,
      `ghostequip.music.instruments.${instrumentKey}`,
      undefined,
      interaction.locale,
    );

    const songLabel = epicSection(await translateForUser(userId, 'ghostequip.music.success.fields.song', undefined, interaction.locale));
    const instrumentLabel = epicSection(await translateForUser(userId, 'ghostequip.music.success.fields.instrument', undefined, interaction.locale));
    const tempoLabel = epicSection(await translateForUser(userId, 'ghostequip.music.success.fields.tempo', undefined, interaction.locale));
    const tempoValue = `\`${finalTempo} BPM\``;

    await editFakeReply(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.music.success.title', undefined, interaction.locale),
      description: await fakeSuccessDescription(userId, 'ghostequip.music.success.description', undefined, interaction.locale),
      fields: [
        { name: songLabel, value: `\`${trackDisplay}\``, inline: true },
        { name: instrumentLabel, value: instrumentDisplay, inline: true },
        { name: tempoLabel, value: tempoValue, inline: true },
      ],
      image: track?.albumArt || undefined,
      author,
    });
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP MUSIC] Error:', error);

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(
          userId,
          'ghostequip.common.errors.partyNotFound.descriptionAccount',
          { displayName: mainAccount?.displayName || '?' },
          interaction.locale,
        ),
        fields: [{
          name: epicSection(await translateForUser(userId, 'ghostequip.common.errors.suggestion.title', undefined, interaction.locale)),
          value: await translateForUser(userId, 'ghostequip.common.errors.suggestion.activeParty', undefined, interaction.locale),
          inline: false,
        }],
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
