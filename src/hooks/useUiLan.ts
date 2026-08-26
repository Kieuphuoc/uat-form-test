import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { decodeJwtPayload } from '../api/client';
import { normalizeLan, type LangCode } from '../lib/localizedText';

function lanFromJwt(jwt: string | null | undefined): string | undefined {
  if (!jwt) return undefined;
  const claims = decodeJwtPayload(jwt);
  const lan = claims?.lan;
  return typeof lan === 'string' ? lan : undefined;
}

/** Ngôn ngữ UI hiện tại (v|e|o) từ user / JWT; mặc định v. */
export function useUiLan(): LangCode {
  const auth = useAuth();
  return useMemo(
    () => normalizeLan(auth.user?.lan ?? lanFromJwt(auth.jwt)),
    [auth.user?.lan, auth.jwt],
  );
}
