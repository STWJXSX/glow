import type { ChatInputCommandInteraction } from 'discord.js';
import { translateForUser } from '#helpers/locales/index.ts';
import { epicQuote, epicSection } from '../epicEmbedHelper.ts';
import type { FortniteGlobalProfile } from './types.ts';

function formatBool(
  value: boolean | undefined,
  yes: string,
  no: string,
  unavailable: string,
): string {
  if (value === true) return yes;
  if (value === false) return no;
  return unavailable;
}

function formatRegion(region: string | undefined, unavailable: string): string {
  if (!region || region === 'UNDEFINED_REGION') return unavailable;
  return region.replace(/_/g, ' ');
}

export async function buildGlanceEmbedFields(
  interaction: ChatInputCommandInteraction,
  userId: string,
  displayName: string,
  accountId: string,
  profile: FortniteGlobalProfile | null,
): Promise<{ description: string; fields: { name: string; value: string; inline: boolean }[] }> {
  const locale = interaction.locale;
  const yes = await translateForUser(userId, 'glance.embed.yes', undefined, locale);
  const no = await translateForUser(userId, 'glance.embed.no', undefined, locale);
  const unavailable = await translateForUser(userId, 'glance.embed.unavailable', undefined, locale);

  const playerLabel = await translateForUser(userId, 'glance.embed.fields.player', undefined, locale);
  const levelLabel = await translateForUser(userId, 'glance.embed.fields.seasonLevel', undefined, locale);
  const regionLabel = await translateForUser(userId, 'glance.embed.fields.region', undefined, locale);
  const bpLabel = await translateForUser(userId, 'glance.embed.fields.battlePass', undefined, locale);
  const crewLabel = await translateForUser(userId, 'glance.embed.fields.crew', undefined, locale);
  const langLabel = await translateForUser(userId, 'glance.embed.fields.languages', undefined, locale);

  let description = epicQuote(
    await translateForUser(
      userId,
      'glance.embed.lead',
      { name: displayName },
      locale,
    ),
  );

  const sparseGlobal =
    profile &&
    profile.languages?.length &&
    profile.seasonLevel == null &&
    !profile.playRegion &&
    profile.hasBattlePass == null &&
    profile.hasCrewMembership == null;

  if (sparseGlobal) {
    const hint = await translateForUser(userId, 'glance.embed.sparsePrivacy', undefined, locale);
    description = `${description}\n\n${epicQuote(hint)}`;
  }

  const level = profile?.seasonLevel != null ? `\`${profile.seasonLevel}\`` : unavailable;
  const region = formatRegion(profile?.playRegion, unavailable);
  const battlePass = formatBool(profile?.hasBattlePass, yes, no, unavailable);
  const crew = formatBool(profile?.hasCrewMembership, yes, no, unavailable);
  const languages = profile?.languages?.length
    ? profile.languages.map((l) => `\`${l}\``).join(', ')
    : unavailable;

  const fields = [
    {
      name: epicSection(playerLabel),
      value: `**${displayName}**\n\`${accountId}\``,
      inline: false,
    },
    {
      name: epicSection(levelLabel),
      value: level,
      inline: true,
    },
    {
      name: epicSection(regionLabel),
      value: region,
      inline: true,
    },
    {
      name: epicSection(bpLabel),
      value: battlePass,
      inline: true,
    },
    {
      name: epicSection(crewLabel),
      value: crew,
      inline: true,
    },
    {
      name: epicSection(langLabel),
      value: languages,
      inline: true,
    },
  ];

  return { description, fields };
}
