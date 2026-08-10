import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  authAritoSession,
  buildLoginHref,
  fetchAuthConfig,
  fetchAuthMe,
  type AuthUser,
} from '../api/authApi';
import { clearJwt, getJwt, isJwtExpired, setJwt } from '../api/client';
import { installFormCacheClearListener } from '../lib/formRuntimeCache';

type AuthState = {
  status: 'loading' | 'ready';
  jwt: string | null;
  user: AuthUser | null;
  isAdmin: boolean;
  mobile: boolean;
  loginError: string | null;
  setToken: (token: string | null) => void;
  acceptSession: (token: string, user?: AuthUser | null) => void;
  login: (nextPath?: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
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

function decodeIsAdmin(jwt: string): boolean {
  try {
    const part = jwt.split('.')[1];
    if (!part) return false;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      is_admin?: string | boolean;
    };
    return json.is_admin === true || json.is_admin === '1' || json.is_admin === 'true';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [jwt, setJwtState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobile, setMobile] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const applyToken = useCallback((token: string | null, nextUser?: AuthUser | null) => {
    if (!token || isJwtExpired(token)) {
      clearJwt();
      setJwtState(null);
      setUser(null);
      return;
    }
    setJwt(token, true);
    setJwtState(token);
    if (nextUser) {
      setUser(nextUser);
    } else {
      setUser((prev) =>
        prev
          ? { ...prev, isAdmin: decodeIsAdmin(token) || prev.isAdmin }
          : {
              userId: 0,
              clientId: '',
              email: '',
              nickname: '',
              isAdmin: decodeIsAdmin(token),
            },
      );
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getJwt();
    if (!token || isJwtExpired(token)) {
      applyToken(null);
      return;
    }
    const me = await fetchAuthMe();
    if (me.success && me.data) {
      setUser(me.data);
      setJwtState(token);
      return;
    }
    // JWT còn hạn nhưng /me fail — giữ token (có thể embed), suy isAdmin từ claim
    setJwtState(token);
    setUser((prev) =>
      prev ?? {
        userId: 0,
        clientId: '',
        email: '',
        nickname: '',
        isAdmin: decodeIsAdmin(token),
      },
    );
  }, [applyToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embed = params.get('embed_token')?.trim();
    const isMobile = params.get('mobile') === 'true';
    setMobile(isMobile);
    if (isMobile) document.body.classList.add('mobile-embed');

    if (params.get('login_error') === '1') {
      setLoginError('Đăng nhập thất bại. Thử lại hoặc kiểm tra cookie keycloak / Auth Apps:mobile.');
      stripQueryKeys('login_error');
    }

    void (async () => {
      if (embed && !isJwtExpired(embed)) {
        setJwt(embed, true);
        setJwtState(embed);
        setUser({
          userId: 0,
          clientId: '',
          email: '',
          nickname: '',
          isAdmin: decodeIsAdmin(embed),
        });
        stripQueryKeys('embed_token');
        // Embed: không bắt buộc /me
        setStatus('ready');
        return;
      }

      const existing = getJwt();
      if (existing && !isJwtExpired(existing)) {
        setJwtState(existing);
        await refreshMe();
      } else {
        clearJwt();
        setJwtState(null);
        setUser(null);
      }
      setStatus('ready');
    })();
  }, [refreshMe]);

  useEffect(() => installFormCacheClearListener(), []);

  const login = useCallback(async (nextPath = '/admin') => {
    setLoginError(null);
    // Thử đổi cookie sẵn có trước khi nhảy IdP
    const session = await authAritoSession();
    if (session.success && session.data?.jwt) {
      applyToken(session.data.jwt, session.data.user);
      if (!session.data.user.isAdmin) {
        setLoginError('Đã có phiên nhưng tài khoản không phải admin.');
        return;
      }
      window.location.assign(nextPath.startsWith('/') ? nextPath : '/admin');
      return;
    }

    const cfg = await fetchAuthConfig();
    const href = cfg.loginUrl
      ? buildLoginHref(cfg.loginUrl, nextPath)
      : buildLoginHref('https://id.arito.vn/mobile-login', nextPath);
    window.location.href = href;
  }, [applyToken]);

  const logout = useCallback(() => {
    clearJwt();
    setJwtState(null);
    setUser(null);
    setLoginError(null);
  }, []);

  const acceptSession = useCallback(
    (token: string, nextUser?: AuthUser | null) => {
      applyToken(token, nextUser);
      setLoginError(null);
    },
    [applyToken],
  );

  const isAdmin = !!user?.isAdmin || (!!jwt && decodeIsAdmin(jwt));

  const value = useMemo<AuthState>(
    () => ({
      status,
      jwt,
      user,
      isAdmin,
      mobile,
      loginError,
      setToken: (token) => applyToken(token),
      acceptSession,
      login,
      logout,
      refreshMe,
    }),
    [
      status,
      jwt,
      user,
      isAdmin,
      mobile,
      loginError,
      applyToken,
      acceptSession,
      login,
      logout,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}
