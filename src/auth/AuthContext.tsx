import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearJwt, getJwt, isJwtExpired, setJwt } from '../api/client';
import { installFormCacheClearListener } from '../lib/formRuntimeCache';

type AuthState = {
  status: 'loading' | 'ready';
  jwt: string | null;
  mobile: boolean;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

function stripQueryKeys(...keys: string[]) {
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const k of keys) {
    if (params.has(k)) {
      params.delete(k);
      changed = true;
    }
  }
  if (!changed) return;
  const qs = params.toString();
  window.history.replaceState(
    {},
    '',
    window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [jwt, setJwtState] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embed = params.get('embed_token')?.trim();
    const isMobile = params.get('mobile') === 'true';
    setMobile(isMobile);
    if (isMobile) document.body.classList.add('mobile-embed');

    if (embed && !isJwtExpired(embed)) {
      setJwt(embed, true);
      setJwtState(embed);
      stripQueryKeys('embed_token');
    } else {
      const existing = getJwt();
      setJwtState(existing && !isJwtExpired(existing) ? existing : null);
    }
    setStatus('ready');
  }, []);

  useEffect(() => installFormCacheClearListener(), []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      jwt,
      mobile,
      setToken: (token) => {
        if (!token) {
          clearJwt();
          setJwtState(null);
          return;
        }
        setJwt(token, true);
        setJwtState(token);
      },
    }),
    [status, jwt, mobile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}
