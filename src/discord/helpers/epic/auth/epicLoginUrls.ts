/** Epic OAuth helper pages — kept in code so translations never break URLs. */
export const EPIC_LOGIN_URLS = {
  exchange: 'https://www.epicgames.com/id/api/exchange',
  authRedirect:
    'https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code',
} as const;

export const EPIC_LOGIN_FIELDS = {
  exchangeCode: 'code',
  authorizationCode: 'authorizationCode',
} as const;
