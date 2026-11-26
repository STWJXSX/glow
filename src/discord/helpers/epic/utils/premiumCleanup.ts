/**
 * Premium Cleanup Utility
 *
 * Removes automation configs when the user's paid tier no longer meets the system minimum.
 */

import { EmbedBuilder, Client } from 'discord.js';
import { hasAutomationAccessOrThrow } from '#helpers/core/client/premium.ts';
import type { AutomationSystemKey } from '#helpers/core/client/premiumPolicy.ts';
import { log } from '#helpers/core/logger.ts';

interface CleanupResult {
  checked: number;
  removed: number;
}

export async function cleanNonPremiumEntries(
  client: Client,
  model: any,
  name: string,
  automationSystem: AutomationSystemKey,
): Promise<CleanupResult> {
  let checked = 0;
  let removed = 0;

  try {
    const entries = await model.find({});
    const userIds = [...new Set<string>(entries.map((e: any) => e.discordId))];

    const premiumCache = new Map<string, boolean>();
    for (const uid of userIds) {
      try {
        const allowed = await hasAutomationAccessOrThrow(uid, automationSystem);
        premiumCache.set(uid, allowed);
      } catch {
        log.bot.warn({ discordId: uid, db: name }, '[PremiumCleanup] DB error — skipping user this cycle');
        premiumCache.set(uid, true);
      }
    }

    for (const entry of entries) {
      checked++;
      if (premiumCache.get(entry.discordId)) continue;

      await model.deleteOne({ _id: entry._id });
      removed++;

      try {
        const user = await client.users.fetch(entry.discordId).catch(() => null);
        if (user) {
          const embed = new EmbedBuilder()
            .setColor(0xCF0D10)
            .setTitle('Premium Feature Disabled')
            .setDescription(
              `Your **${name}** configuration was removed because your Glow tier no longer includes this automation.\n\n` +
              `Check \`/premium check\` or upgrade your plan.`,
            )
            .setFooter({ text: 'Glow Premium' })
            .setTimestamp();
          await user.send({ embeds: [embed] }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    if (removed > 0) {
      log.bot.info({ checked, removed, db: name }, '[PremiumCleanup] Cleanup complete');
    }
  } catch (err) {
    log.bot.error({ err, db: name }, '[PremiumCleanup] Error during cleanup');
  }

  return { checked, removed };
}
