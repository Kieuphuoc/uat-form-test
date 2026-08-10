import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { normalizeLan, type LangCode } from '../lib/localizedText';

function lanFromJwt(jwt: string | null | undefined): string | undefined {
  if (!jwt) return undefined;
  try {
    const part = jwt.split('.')[1];
    if (!part) return undefined;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      lan?: string;
    };
    return json.lan;
  } catch {
    return undefined;
  }
}

/** Ngôn ngữ UI hiện tại (v|e|o) từ user / JWT; mặc định v. */
export function useUiLan(): LangCode {
  const auth = useAuth();
  return useMemo(
    () => normalizeLan(auth.user?.lan ?? lanFromJwt(auth.jwt)),
    [auth.user?.lan, auth.jwt],
  );
}
