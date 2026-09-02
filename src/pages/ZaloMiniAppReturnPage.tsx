import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { signalZaloBindClose, startZaloBind } from '../api/authApi';
import { IconCheck } from '../components/AppIcons';
import { useAuth } from '../auth/AuthContext';
import { closeZaloWebview } from '../lib/closeZaloWebview';

const LOGO_SRC = '/arito-logo.png';

export function ZaloMiniAppReturnPage() {
  const { user } = useAuth();
  const { handoff } = useParams<{ handoff?: string }>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const finishBind = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await startZaloBind(handoff);
    if (!res.success || !res.data?.bindToken) {
      setBusy(false);
      setError(res.error || 'Không hoàn tất liên kết Mini App.');
      return false;
    }
    setBusy(false);
    void signalZaloBindClose(handoff);
    void closeZaloWebview();
    return true;
  }, [handoff]);

  useEffect(() => {
    void finishBind();
  }, [finishBind]);

  const displayName = user?.nickname || user?.email || `user #${user?.userId ?? 0}`;
  const email = user?.email?.trim() && user.email !== displayName ? user.email : '';

  return (
    <div className="zalo-return">
      <div className="zalo-return-body">
        <img
          className="zalo-return-logo"
          src={LOGO_SRC}
          alt="Arito"
          width={240}
          height={80}
        />
        <p className="zalo-return-hello">Arito xin chào!</p>
        <p className="zalo-return-badge">
          <IconCheck size={16} />
          Đăng nhập AritoID thành công
        </p>
        <h1 className="zalo-return-name">{displayName}</h1>
        {email ? <p className="zalo-return-email">{email}</p> : null}

        {busy ? (
          <p className="zalo-return-lead">Đang hoàn tất liên kết Mini App…</p>
        ) : error ? (
          <p className="zalo-return-error">{error}</p>
        ) : (
          <>
            <p className="zalo-return-lead">
              Mini App đã sẵn sàng. Hãy đóng trang này và trở về màn hình Mini App
              để tiếp tục sử dụng.
            </p>
            <ol className="zalo-return-steps">
              <li>
                Nhấn nút đóng (<strong>X</strong>) hoặc back (<strong>&lt;</strong>) ở góc trên thanh Zalo để đóng form này
              </li>
              <li>Quay lại ARITO Mini App — tài khoản AritoID đã được liên kết</li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
