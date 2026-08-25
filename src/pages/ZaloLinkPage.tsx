import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchZaloMapping,
  startZaloBind,
  unbindZalo,
  type ZaloBindStart,
  type ZaloMapping,
} from '../api/authApi';
import { IconZalo } from '../components/AppIcons';
import { useAuth } from '../auth/AuthContext';

function maskZaloId(id: string | null | undefined): string {
  const raw = (id ?? '').trim();
  if (!raw) return '—';
  if (raw.length <= 6) return raw;
  return `…${raw.slice(-4)}`;
}

function qrImageSrc(qrUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}`;
}

export function ZaloLinkPage() {
  const { user } = useAuth();
  const [mapping, setMapping] = useState<ZaloMapping | null>(null);
  const [bind, setBind] = useState<ZaloBindStart | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [remain, setRemain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMapping = useCallback(async () => {
    const res = await fetchZaloMapping();
    if (!res.success || !res.data) {
      setError(res.error || 'Không lấy được trạng thái liên kết.');
      return null;
    }
    setMapping(res.data);
    setError(null);
    return res.data;
  }, []);

  const createQr = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await startZaloBind();
    setBusy(false);
    if (!res.success || !res.data?.qrUrl) {
      setBind(null);
      setError(res.error || 'Không tạo được mã QR.');
      return;
    }
    setBind(res.data);
    const ttl = Math.max(30, res.data.expiresIn || 300);
    setExpiresAt(Date.now() + ttl * 1000);
    setRemain(ttl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await loadMapping();
      if (cancelled || current?.linked) return;
      await createQr();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMapping, createQr]);

  useEffect(() => {
    if (!bind || mapping?.linked) return;
    const timer = window.setInterval(() => {
      const sec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemain(sec);
      if (sec <= 0) void createQr();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [bind, mapping?.linked, expiresAt, createQr]);

  useEffect(() => {
    if (mapping?.linked || !bind) return;
    const poll = window.setInterval(() => {
      void loadMapping();
    }, 2000);
    return () => window.clearInterval(poll);
  }, [mapping?.linked, bind, loadMapping]);

  const onUnbind = async () => {
    if (!window.confirm('Hủy liên kết Zalo với tài khoản Arito này?')) return;
    setBusy(true);
    const res = await unbindZalo();
    setBusy(false);
    if (!res.success) {
      setError(res.error || 'Không hủy được liên kết.');
      return;
    }
    setMapping({ linked: false, userId: user?.userId ?? 0, zaloId: null });
    await createQr();
  };

  const linked = !!mapping?.linked;

  return (
    <div className="shell stack zalo-link">
      <p>
        <Link to="/">← Trang chủ</Link>
      </p>
      <header className="zalo-link-head">
        <span className="zalo-link-icon">
          <IconZalo size={28} />
        </span>
        <div>
          <h1>Liên kết Zalo Mini App</h1>
          <p className="muted">
            Tài khoản Arito {user?.nickname || user?.email || `#${user?.userId ?? 0}`}. Quét QR bằng
            Zalo trên điện thoại để gắn zalo_id.
          </p>
        </div>
      </header>

      {error && <div className="banner">{error}</div>}

      {linked ? (
        <div className="zalo-link-card">
          <p>
            Đã liên kết Zalo ID <strong>{maskZaloId(mapping?.zaloId)}</strong>
          </p>
          <button type="button" className="secondary" disabled={busy} onClick={() => void onUnbind()}>
            Hủy liên kết
          </button>
        </div>
      ) : (
        <div className="zalo-link-card">
          {bind?.qrUrl ? (
            <>
              <img
                className="zalo-link-qr"
                src={qrImageSrc(bind.qrUrl)}
                alt="QR Mini App Zalo"
                width={240}
                height={240}
              />
              <p className="muted">Quét bằng Zalo. QR đã gắn env=DEVELOPMENT (chưa phải bản Live). Còn {remain}s.</p>
              <p className="zalo-link-url muted">{bind.qrUrl}</p>
              <div className="banner zalo-link-hint">
                Nếu Zalo báo <strong>đang trong giai đoạn phát triển</strong>: QR Live chưa được duyệt.
                Phải có <code>env=DEVELOPMENT</code> hoặc <code>env=TESTING</code> trên URL (Auth{' '}
                <code>Zalo:Env</code>). Bản DEVELOPMENT đôi khi cần thêm <code>Zalo:Version</code> (VERSION_ID
                trên Mini App Center). Tài khoản Zalo còn phải nằm trong{' '}
                <strong>Người dùng thử nghiệm</strong> (không chỉ danh sách Admin).
              </div>
              <button type="button" className="secondary" disabled={busy} onClick={() => void createQr()}>
                Tạo mã mới
              </button>
            </>
          ) : (
            <p className="muted">{busy ? 'Đang tạo mã…' : 'Chưa có mã QR.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
