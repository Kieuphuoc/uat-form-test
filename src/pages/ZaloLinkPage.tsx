import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

function qrImageSrc(qrUrl: string, size = 240): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrUrl)}`;
}

export function ZaloLinkPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const embed = params.get('embed') === 'true' || params.get('embed') === '1';

  const [mapping, setMapping] = useState<ZaloMapping | null>(null);
  const [bind, setBind] = useState<ZaloBindStart | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [remain, setRemain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  if (embed) {
    if (linked) {
      return (
        <div className="zalo-embed">
          <p className="ok">Đã liên kết Zalo</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="zalo-embed">
          <p className="err">{error}</p>
        </div>
      );
    }
    if (!bind?.qrUrl) {
      return (
        <div className="zalo-embed">
          <p className="muted">{busy ? 'Đang tạo mã…' : 'Đang tải QR…'}</p>
        </div>
      );
    }
    return (
      <div className="zalo-embed">
        <img
          className="zalo-link-qr"
          src={qrImageSrc(bind.qrUrl, 280)}
          alt="QR liên kết Zalo"
          width={280}
          height={280}
        />
      </div>
    );
  }

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
            Tài khoản Arito {user?.nickname || user?.email || `#${user?.userId ?? 0}`}. Quét QR trong Mini
            App (nút Quét QR đăng nhập) hoặc mở link bên dưới trên Zalo.
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
                alt="QR liên kết Zalo"
                width={240}
                height={240}
              />
              <p className="muted">Mã còn hiệu lực {remain}s — cùng mã với nút Quét QR đăng nhập trên Mini App.</p>
              <p className="zalo-link-url">{bind.qrUrl}</p>
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(bind.qrUrl).then(
                      () => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                      },
                      () => undefined,
                    );
                  }}
                >
                  {copied ? 'Đã copy link' : 'Copy link'}
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => void createQr()}>
                  Tạo mã mới
                </button>
              </div>
            </>
          ) : (
            <p className="muted">{busy ? 'Đang tạo mã…' : 'Chưa có mã QR.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
