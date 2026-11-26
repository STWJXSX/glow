import { translateForUser } from '#helpers/locales/index.ts';

/** Success description + italic team-visibility reminder for ghostequip embeds. */
export async function ghostequipSuccessDescription(
  userId: string,
  descriptionKey: string,
  vars: Record<string, string> | undefined,
  locale?: string,
): Promise<string> {
  const main = await translateForUser(userId, descriptionKey, vars, locale);
  const reminder = await translateForUser(
    userId,
    'ghostequip.common.success.teamVisibilityReminder',
    undefined,
    locale,
  );
  return `${main}\n\n*${reminder}*`;
}
