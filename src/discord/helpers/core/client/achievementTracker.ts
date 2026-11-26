/**
 * ACHIEVEMENT TRACKER
 *
 * Registra uso de comandos y eventos puntuales en AchievementStats.
 * Fire-and-forget: nunca bloquea ni rompe el flujo de un comando.
 */

import AchievementStats from '#models/AchievementStats.ts';
import { isMongoConnected } from '#events/db/mongodb.ts';
import { log } from '../logger.ts';

/** Claves de Map en Mongo no admiten '.' ni '$' */
function sanitizeKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cuenta una ejecución exitosa de comando.
 * Actualiza total, contador por comando, timestamps y días activos.
 */
export function trackCommandUsage(discordId: string, commandName: string): void {
  if (!isMongoConnected()) return;

  const cmd = sanitizeKey(commandName);
  const today = todayUTC();
  const now = new Date();

  void (async () => {
    try {
      // returnDocument 'before': null si el doc es nuevo (setOnInsert ya deja el día contado)
      const before = await AchievementStats.findOneAndUpdate(
        { discordId },
        {
          $inc: { totalCommands: 1, [`commands.${cmd}`]: 1 },
          $set: { lastCommandAt: now, updatedAt: now },
          $setOnInsert: {
            firstCommandAt: now,
            activeDays: 1,
            lastActiveDay: today,
          },
        },
        { upsert: true, returnDocument: 'before' },
      ).lean();

      if (before && before.lastActiveDay !== today) {
        // Guard atómico: solo incrementa si otro proceso no contó ya el día
        await AchievementStats.updateOne(
          { discordId, lastActiveDay: { $ne: today } },
          { $set: { lastActiveDay: today, updatedAt: now }, $inc: { activeDays: 1 } },
        );
      }
    } catch (err) {
      log.database.debug({ err, discordId, command: cmd }, '[Achievements] Error registrando uso de comando');
    }
  })();
}

/**
 * Incrementa un contador genérico de evento (ej: 'premiumRedeems').
 */
export function trackAchievementEvent(discordId: string, counter: string, amount = 1): void {
  if (!isMongoConnected()) return;

  const key = sanitizeKey(counter);

  void (async () => {
    try {
      await AchievementStats.updateOne(
        { discordId },
        {
          $inc: { [`counters.${key}`]: amount },
          $set: { updatedAt: new Date() },
        },
        { upsert: true },
      );
    } catch (err) {
      log.database.debug({ err, discordId, counter: key }, '[Achievements] Error registrando evento');
    }
  })();
}
