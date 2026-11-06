/**
 * Forwards automation event embeds (success + failure) to developer DMs.
 *
 * Enabled by default. Set `EPIC_AUTOMATION_DEV_FORWARD=false` to disable.
 * Targets `DEVELOPER_IDS` env + `DEVELOPER_USER_ID` from embedHelper.
 */

import {
  type Client,
  EmbedBuilder,
  type Message,
  type MessageCreateOptions,
} from 'discord.js';
import { DEVELOPER_USER_ID } from '#helpers/core/embedHelper.ts';
import { getDeveloperIds } from '#helpers/discord/dev/devAuth.ts';
import { log } from '#helpers/core/logger.ts';

export type AutomationKind = 'success' | 'error' | 'info';

export interface AutomationNotifyMeta {
  system: string;
  kind?: AutomationKind;
}

const FORWARD_ENABLED = process.env.EPIC_AUTOMATION_DEV_FORWARD !== 'false';

function getForwardDevIds(): string[] {
  const ids = new Set(getDeveloperIds());
  ids.add(DEVELOPER_USER_ID);
  return [...ids];
}

function toEmbedBuilders(embeds: MessageCreateOptions['embeds']): EmbedBuilder[] {
  if (!embeds?.length) return [];
  return embeds.map((embed) =>
    embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed),
  );
}

function buildDevPayload(
  targetDiscordId: string,
  options: MessageCreateOptions,
  meta: AutomationNotifyMeta,
): MessageCreateOptions {
  const kind = meta.kind ?? 'info';
  const header = new EmbedBuilder()
    .setColor(kind === 'error' ? 0xff0000 : kind === 'success' ? 0x00ff00 : 0xffc87c)
    .setTitle(`[${meta.system}]`)
    .setDescription(`User: <@${targetDiscordId}> (\`${targetDiscordId}\`)`)
    .setTimestamp();

  const embeds = [header, ...toEmbedBuilders(options.embeds)];

  return {
    content: options.content ?? undefined,
    embeds,
    components: options.components,
    files: options.files,
  };
}

/** Forward a copy of automation embeds to all developer IDs. */
export async function forwardAutomationToDev(
  client: Client,
  targetDiscordId: string,
  options: MessageCreateOptions,
  meta: AutomationNotifyMeta,
): Promise<void> {
  if (!FORWARD_ENABLED) return;

  const devIds = getForwardDevIds();
  const payload = buildDevPayload(targetDiscordId, options, meta);

  for (const devId of devIds) {
    if (devId === targetDiscordId) continue;

    try {
      const dev = await client.users.fetch(devId);
      await dev.send(payload);
    } catch (err) {
      log.epic.debug(
        { devId, system: meta.system, error: err instanceof Error ? err.message : String(err) },
        '[AUTOMATION-NOTIFY] Dev forward failed',
      );
    }
  }
}

/**
 * Send automation DM to user and mirror the same embed(s) to developer(s).
 * On user DM failure, still forwards to dev so failures are visible.
 */
export async function sendAutomationUserDm(
  client: Client,
  discordId: string,
  options: MessageCreateOptions,
  meta: AutomationNotifyMeta,
): Promise<Message | null> {
  try {
    const user = await client.users.fetch(discordId);
    const sent = await user.send(options);
    await forwardAutomationToDev(client, discordId, options, meta);
    return sent;
  } catch (err) {
    await forwardAutomationToDev(client, discordId, options, {
      ...meta,
      kind: meta.kind ?? 'error',
    });
    throw err;
  }
}

export function isAutomationDevForwardEnabled(): boolean {
  return FORWARD_ENABLED;
}

export function getAutomationDevForwardIds(): string[] {
  return getForwardDevIds();
}
