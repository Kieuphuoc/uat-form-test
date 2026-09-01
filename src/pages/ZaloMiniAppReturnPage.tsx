import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { startZaloBind } from '../api/authApi';
import { IconCheck, IconZalo } from '../components/AppIcons';
import { useAuth } from '../auth/AuthContext';
import { closeZaloWebview } from '../lib/closeZaloWebview';

export function ZaloMiniAppReturnPage() {
  const { user } = useAuth();
  const { handoff } = useParams<{ handoff?: string }>();
  const [qrUrl, setQrUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBind = useCallback(async (): Promise<string> => {
    setBusy(true);
    setError(null);
    const res = await startZaloBind(handoff);
    setBusy(false);
    if (!res.success || !res.data?.qrUrl) {
      setQrUrl('');
      setError(res.error || 'Không tạo được liên kết Mini App.');
      return '';
    }
    setQrUrl(res.data.qrUrl);
    const ttl = Math.max(30, res.data.expiresIn || 300);
    setExpiresAt(Date.now() + ttl * 1000);
    return res.data.qrUrl;
  }, [handoff]);

  useEffect(() => {
    void createBind();
  }, [createBind]);

  const openMiniApp = useCallback(async () => {
    setOpening(true);
    setError(null);
    let url = qrUrl.trim();
    if (!url || Date.now() >= expiresAt) {
      url = await createBind();
    }
    if (!url) {
      setOpening(false);
      return;
    }
    await closeZaloWebview();
    setOpening(false);
  }, [qrUrl, expiresAt, createBind]);

  const displayName = user?.nickname || user?.email || `user #${user?.userId ?? 0}`;
  const email = user?.email?.trim() && user.email !== displayName ? user.email : '';
  const ready = !!qrUrl && !busy;

  return (
    <div className="zalo-return">
      <div className="zalo-return-body">
        <div className="zalo-return-mark" aria-hidden>
          <IconZalo size={36} />
        </div>
        <p className="zalo-return-badge">
          <IconCheck size={16} />
          Đã đăng nhập AritoID
        </p>
        <h1 className="zalo-return-name">{displayName}</h1>
        {email ? <p className="zalo-return-email">{email}</p> : null}
        <p className="zalo-return-lead">
          Mở Mini App để liên kết tài khoản Zalo và tiếp tục sử dụng.
        </p>
        {error ? <p className="zalo-return-error">{error}</p> : null}
      </div>
      <div className="zalo-return-foot">
        <button
          type="button"
          className="zalo-return-open"
          disabled={opening || (!ready && busy)}
          onClick={() => void openMiniApp()}
        >
          {opening ? 'Đang mở Mini App…' : busy ? 'Đang chuẩn bị…' : 'Mở ARITO Mini App'}
        </button>
      </div>
    </div>
  );
}
