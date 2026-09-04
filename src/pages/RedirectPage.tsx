import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authAritoSession } from '../api/authApi';
import { useAuth } from '../auth/AuthContext';

type Props = {
  /** Khi IdP nuốt query `next` — dùng path riêng /redirect/mini-app. */
  defaultNext?: string;
};

/**
 * Sau IdP login: đổi cookie keycloak → JWT → chuyển tới next.
 * `?next=` mất thì mặc định /admin (IdP chỉ trả /redirect?from=idp).
 */
export function RedirectPage({ defaultNext = '/admin' }: Props) {
  const [params] = useSearchParams();
  const { acceptSession, jwt } = useAuth();
  const [message, setMessage] = useState('Đang hoàn tất đăng nhập…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const fromQuery = params.get('next')?.trim() || '';
      const next = fromQuery || defaultNext;
      const safeNext = next.startsWith('/') ? next : defaultNext;

      setMessage('Đã có cookie AritoID — đang tạo JWT…');
      const session = await authAritoSession();

      if (session.success && session.data?.jwt) {
        acceptSession(session.data.jwt, session.data.user);
        setMessage('Đăng nhập thành công');
        window.location.replace(safeNext);
        return;
      }

      const target = safeNext.startsWith('/redirect') ? '/' : safeNext;
      setMessage(session.error || 'Đăng nhập thất bại — chưa có cookie keycloak gửi tới Form.Api.');
      window.setTimeout(() => {
        // Về đúng chỗ đã bấm đăng nhập (vd. /chat), không dồn hết về /admin.
        window.location.replace(`${target}${target.includes('?') ? '&' : '?'}login_error=1`);
      }, 1800);
    })();
  }, [acceptSession, params, jwt, defaultNext]);

  return (
    <div className="shell stack" style={{ textAlign: 'center', paddingTop: 80 }}>
      <p>{message}</p>
      <p className="muted">/redirect · Form.Api arito-session</p>
    </div>
  );
}
