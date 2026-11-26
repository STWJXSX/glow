/**
 * Giftbot system switch (`GIFTBOTS_ENABLED`, default off).
 * Off: /giftbot and /precio-pavos are not registered, and the gift panels / shop catalog
 * warmer don't start.
 */

const ON_VALUES = new Set(['1', 'true', 'on', 'yes']);

export function isGiftbotsEnabled(): boolean {
  return ON_VALUES.has((process.env.GIFTBOTS_ENABLED ?? '').trim().toLowerCase());
}

/** True for command files of the giftbot system (src/discord/commands/giftbots/). */
export function isGiftbotCommandFile(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').includes('/commands/giftbots/');
}
