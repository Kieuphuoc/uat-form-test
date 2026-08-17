import type { NavigateFunction } from 'react-router-dom';

/** Giữ `?mobile=true` (và query khác) khi đổi route trong iframe embed. */
export function chatLocation(path: string) {
  return { pathname: path, search: window.location.search };
}

export function navigateChat(
  navigate: NavigateFunction,
  path: string,
  options?: { replace?: boolean },
) {
  navigate(chatLocation(path), options);
}
