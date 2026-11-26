import type { AutocompleteInteraction } from 'discord.js';
import UsuarioInfo, { type IDeviceAuth, type IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { stripAutocompleteLabel } from '../epicEmbedHelper.ts';

export const ACCOUNT_SENTINEL_NONE = '__cloudconfig_no_account__';

const MAX_AUTOCOMPLETE = 25;

export function filterLinkedAccounts(accounts: IDeviceAuth[], query: string): IDeviceAuth[] {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? accounts.filter(
        (acc) =>
          (acc.displayName?.toLowerCase().includes(q) ?? false) ||
          acc.accountId.toLowerCase().includes(q),
      )
    : [...accounts];

  return filtered
    .sort((a, b) => {
      if (a.cuentaMain !== b.cuentaMain) return a.cuentaMain ? -1 : 1;
      return (a.displayName ?? a.accountId).localeCompare(b.displayName ?? b.accountId);
    })
    .slice(0, MAX_AUTOCOMPLETE);
}

export async function respondLinkedAccountAutocomplete(
  interaction: AutocompleteInteraction,
  focusedValue: string,
): Promise<void> {
  const userId = interaction.user.id;
  const user = await UsuarioInfo.findOne({ id: userId });
  const accounts = user?.deviceAuths ?? [];

  if (!accounts.length) {
    await interaction.respond([
      {
        name: stripAutocompleteLabel(
          await translateForUser(userId, 'cloudconfig.autocomplete.noAccounts', undefined, interaction.locale),
        ),
        value: ACCOUNT_SENTINEL_NONE,
      },
    ]);
    return;
  }

  const mainTag = await translateForUser(userId, 'cloudconfig.autocomplete.mainTag', undefined, interaction.locale);
  const filtered = filterLinkedAccounts(accounts, focusedValue);

  await interaction.respond(
    filtered.map((acc) => ({
      name: stripAutocompleteLabel(
        `${acc.displayName ?? acc.accountId}${acc.cuentaMain ? ` (${mainTag})` : ''}`.substring(0, 100),
      ),
      value: acc.accountId,
    })),
  );
}

export async function resolveLinkedAccountById(
  userId: string,
  accountId: string,
): Promise<{ user: IUsuarioInfo; account: IDeviceAuth } | { error: string }> {
  const user = await UsuarioInfo.findOne({ id: userId });
  if (!user?.deviceAuths?.length) {
    return { error: 'no_accounts' };
  }
  if (!accountId || accountId === ACCOUNT_SENTINEL_NONE) {
    return { error: 'invalid_account' };
  }
  const refreshed = await refreshAccountToken(user, accountId);
  if (!refreshed.account) {
    return { error: refreshed.error ?? 'token' };
  }
  return { user, account: refreshed.account };
}

export async function resolveLinkedAccount(
  userId: string,
  accountIdOption: string | null | undefined,
): Promise<{ user: IUsuarioInfo; account: IDeviceAuth } | { error: string }> {
  const user = await UsuarioInfo.findOne({ id: userId });
  if (!user?.deviceAuths?.length) {
    return { error: 'no_accounts' };
  }

  let accountId = accountIdOption?.trim();
  if (!accountId || accountId === ACCOUNT_SENTINEL_NONE) {
    const main = user.deviceAuths.find((a) => a.cuentaMain);
    if (!main) return { error: 'no_main' };
    accountId = main.accountId;
  }

  const refreshed = await refreshAccountToken(user, accountId);
  if (!refreshed.account) {
    return { error: refreshed.error ?? 'token' };
  }

  return { user, account: refreshed.account };
}
