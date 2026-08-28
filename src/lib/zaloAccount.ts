export const ZALO_ACCOUNT_KEY = 'arito-zalo:account-id';
const LEGACY_SOURCE_KEY = 'arito-zalo:source-id';

export type ZaloAccountOption = {
  id: string;
  name: string;
};

export type ResolveZaloAccountResult = {
  accountId: string;
  error?: string;
};

export function readStoredZaloAccountId(): string {
  const current = window.localStorage.getItem(ZALO_ACCOUNT_KEY)?.trim() || '';
  if (current) return current;
  return window.localStorage.getItem(LEGACY_SOURCE_KEY)?.trim() || '';
}

export function persistZaloAccountId(accountId: string): void {
  const id = accountId.trim();
  if (!id) {
    window.localStorage.removeItem(ZALO_ACCOUNT_KEY);
    window.localStorage.removeItem(LEGACY_SOURCE_KEY);
    return;
  }
  window.localStorage.setItem(ZALO_ACCOUNT_KEY, id);
  window.localStorage.removeItem(LEGACY_SOURCE_KEY);
}

export function clearZaloAccountId(): void {
  window.localStorage.removeItem(ZALO_ACCOUNT_KEY);
  window.localStorage.removeItem(LEGACY_SOURCE_KEY);
}

export function resolveZaloAccount(
  enabledAccounts: ZaloAccountOption[],
  storedId = readStoredZaloAccountId(),
): ResolveZaloAccountResult {
  if (enabledAccounts.length === 0) {
    clearZaloAccountId();
    return { accountId: '', error: 'Chưa có phân quyền tài khoản Zalo.' };
  }

  const valid = enabledAccounts.some((item) => item.id === storedId);
  const accountId = valid ? storedId : enabledAccounts[0].id;
  persistZaloAccountId(accountId);
  return { accountId };
}
