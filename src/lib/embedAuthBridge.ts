/** Báo shell mobile (arito-mobile-app) khi iframe mất phiên JWT. */

export const EMBED_AUTH_LOST_MSG = 'arito-embed-auth-lost' as const;

export type EmbedAuthLostReason = 'expired' | 'invalid' | '401' | 'missing' | 'handoff';

export function isMobileEmbed(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mobile') === 'true';
}

export function notifyParentAuthLost(
  reason: EmbedAuthLostReason = 'missing',
  message?: string,
): void {
  if (!isMobileEmbed()) return;
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ type: EMBED_AUTH_LOST_MSG, reason, message }, '*');
  } catch {
    /* ignore */
  }
}
