import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  acceptAttrFromExtensions,
  deleteDraftFormFile,
  extractAccessTokenFromUrl,
  formatSizeKb,
  cacheImagePreviewUrl,
  getCachedImagePreviewUrl,
  invalidateImagePreviewCache,
  loadImagePreviewBlob,
  parseAttachments,
  resolveFileHref,
  resolveUploadMode,
  revokePreviewUrl,
  stashPendingFile,
  takePendingFile,
  uploadFormFile,
  type FormFileItem,
} from '../api/formUploadApi';
import { COLOR_PRESETS, normalizeColorHex } from '../lib/colorPresets';
import type { LangCode } from '../lib/localizedText';
import { uiCopy } from '../lib/uiCopy';
import {
  displayForOpenAs,
  hrefForOpenAs,
  normalizeOpenAs,
  type OpenAsKind,
} from '../lib/openAs';

export function OpenAsAnchor({
  kind,
  value,
  className,
}: {
  kind: OpenAsKind;
  value: string;
  className?: string;
}) {
  const href = hrefForOpenAs(kind, value);
  const text = displayForOpenAs(kind, value) || value;
  return (
    <a
      className={className ?? 'form-openas-link'}
      href={href}
      target={kind === 'link' ? '_blank' : undefined}
      rel="noreferrer"
    >
      {text}
    </a>
  );
}

export function RuntimeColorInput({
  id,
  disabled,
  editable,
  value,
  style,
  lan = 'v',
  onCommit,
}: {
  id: string;
  disabled: boolean;
  editable: boolean;
  value: unknown;
  style?: CSSProperties;
  lan?: LangCode;
  onCommit: (hex: string) => void;
}) {
  const hex = normalizeColorHex(String(value ?? '')) || '#000000';
  const [text, setText] = useState(hex);
  const [open, setOpen] = useState(false);

  return (
    <div className="form-color" style={style}>
      <div className="form-color-row">
        <button
          type="button"
          className="form-color-swatch"
          style={{ background: hex }}
          disabled={disabled || !editable}
          title={uiCopy(lan, 'pickColor')}
          onClick={() => setOpen((o) => !o)}
        />
        <input
          id={id}
          type="text"
          disabled={disabled}
          readOnly={!editable}
          value={text}
          onChange={(e) => {
            if (!editable) return;
            setText(e.target.value);
          }}
          onBlur={() => {
            const n = normalizeColorHex(text);
            const next = n || hex;
            setText(next);
            onCommit(next);
          }}
        />
      </div>
      {open && editable && !disabled ? (
        <div className="form-color-grid" role="listbox">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`form-color-cell${c === hex ? ' is-active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => {
                setText(c);
                onCommit(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CloudUploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="form-attach-cloud-svg">
      <path
        fill="currentColor"
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
      />
    </svg>
  );
}

/** Thumb: blob local hoặc tải /image/256 một lần rồi cache theo file id. */
function FormImageThumbImg({
  item,
  alt,
  fallback,
}: {
  item: FormFileItem;
  alt: string;
  fallback: string;
}) {
  const [src, setSrc] = useState<string | undefined>(() => {
    if (item.previewUrl) return item.previewUrl;
    if (item.id) return getCachedImagePreviewUrl(item.id);
    return undefined;
  });

  useEffect(() => {
    if (item.previewUrl) {
      setSrc(item.previewUrl);
      return;
    }
    const id = item.id?.trim();
    if (!id) {
      setSrc(undefined);
      return;
    }
    const cached = getCachedImagePreviewUrl(id);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    void loadImagePreviewBlob(id, extractAccessTokenFromUrl(item.url)).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.previewUrl, item.url]);

  if (src) return <img src={src} alt={alt} />;
  return <span className="form-image-thumb-fallback">{fallback}</span>;
}

export function RuntimeFileImageInput({
  kind,
  slug,
  disabled,
  editable,
  accept,
  maxFiles,
  uploadMode,
  previewWidth,
  value,
  style,
  lan = 'v',
  onCommit,
}: {
  kind: 'file' | 'image';
  slug: string;
  disabled: boolean;
  /** true chỉ khi formMode new/edit và enabled. */
  editable: boolean;
  accept?: string;
  maxFiles?: number;
  uploadMode?: string;
  previewWidth?: number;
  value: unknown;
  style?: CSSProperties;
  lan?: LangCode;
  onCommit: (items: FormFileItem[]) => void;
}) {
  const items = parseAttachments(value);
  const max = Math.max(1, maxFiles ?? (kind === 'image' ? 1 : 5));
  const mode = resolveUploadMode(uploadMode);
  const thumb = Math.max(24, previewWidth ?? 50);
  const canUpload = editable && !disabled;
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackAccept = kind === 'image' ? 'jpg,jpeg,png,gif,webp' : 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg';
  const acceptAttr = acceptAttrFromExtensions(accept, fallbackAccept);

  const commit = (next: FormFileItem[]) => onCommit(next);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length || !canUpload) return;
    const room = max - items.length;
    if (room <= 0) {
      setError(uiCopy(lan, 'maxFiles', { n: max }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = [...items];
      const files = Array.from(list).slice(0, room);
      for (const f of files) {
        const sizeKb = Math.max(1, Math.round((f.size / 1024) * 100) / 100);
        let item: FormFileItem;
        if (mode === 'onSave') {
          const localId = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          stashPendingFile(localId, f);
          const previewUrl = kind === 'image' ? URL.createObjectURL(f) : undefined;
          item = {
            name: f.name,
            sizeKb,
            status: -1,
            localId,
            previewUrl,
          };
        } else {
          const up = await uploadFormFile(slug, f, { draft: true, kind });
          const previewUrl = kind === 'image' ? URL.createObjectURL(f) : undefined;
          item = {
            id: up.id,
            name: up.meta?.client_name || f.name,
            sizeKb: up.meta?.size_kb ?? sizeKb,
            url: up.url,
            status: up.status ?? 0,
            previewUrl,
          };
          // Giữ thumb local ngay — không phụ thuộc Files /image/256 (thường fail draft/CORS).
          if (kind === 'image' && up.id && previewUrl) {
            cacheImagePreviewUrl(up.id, previewUrl);
          }
        }
        if (kind === 'image') next.push(item);
        else next.unshift(item);
      }
      commit(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : uiCopy(lan, 'uploadFailed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const removeAt = (idx: number) => {
    if (!canUpload) return;
    const target = items[idx];
    if (target?.previewUrl) revokePreviewUrl(target.previewUrl);
    if (target?.localId) takePendingFile(target.localId);
    if (target?.id) invalidateImagePreviewCache(target.id);
    // Draft đã up (status=0): xóa luôn Files.Api để dọn rác.
    if (target?.id && target.status === 0) {
      void deleteDraftFormFile(slug, target.id);
    }
    commit(items.filter((_, i) => i !== idx));
  };

  const openFile = (item: FormFileItem) => {
    if (item.previewUrl) {
      window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const href = resolveFileHref(item.url, item.id);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  const numbered = items.map((item, i) => ({ item, idx: i, n: items.length - i }));

  const hiddenInputs = (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={max > 1}
        accept={acceptAttr || (kind === 'image' ? 'image/*' : undefined)}
        disabled={!canUpload}
        onChange={(e) => {
          if (!canUpload) return;
          void addFiles(e.target.files);
        }}
      />
      {kind === 'image' ? (
        <input
          ref={cameraRef}
          type="file"
          hidden
          accept="image/*"
          capture="environment"
          disabled={!canUpload}
          onChange={(e) => {
            if (!canUpload) return;
            void addFiles(e.target.files);
          }}
        />
      ) : null}
    </>
  );

  if (kind === 'image') {
    return (
      <div
        className={`form-attach form-attach--image${canUpload ? ' form-attach--editable' : ' form-attach--readonly'}`}
        style={style}
      >
        <div className="form-image-box">
          <div className="form-image-thumbs">
            {numbered.map(({ item, idx, n }) => (
              <div
                key={`${item.id || item.localId || item.name}-${n}`}
                className="form-image-thumb-wrap"
                style={{ width: thumb, height: thumb }}
              >
                <button
                  type="button"
                  className="form-image-thumb"
                  title={item.name}
                  onClick={() => openFile(item)}
                >
                  <FormImageThumbImg item={item} alt={item.name} fallback={String(n)} />
                </button>
                {canUpload ? (
                  <button
                    type="button"
                    className="form-image-remove"
                    title={uiCopy(lan, 'removeImage')}
                    aria-label={uiCopy(lan, 'removeImage')}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAt(idx);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {canUpload ? (
            <div className="form-image-actions">
              <button
                type="button"
                className="form-image-action"
                disabled={busy || items.length >= max}
                onClick={() => cameraRef.current?.click()}
              >
                <span className="form-image-action-icon" aria-hidden>
                  📷
                </span>
                {uiCopy(lan, 'takePhoto')}
              </button>
              <button
                type="button"
                className="form-image-action"
                disabled={busy || items.length >= max}
                onClick={() => inputRef.current?.click()}
              >
                <span className="form-image-action-icon" aria-hidden>
                  🖼️
                </span>
                {uiCopy(lan, 'chooseImage')}
              </button>
            </div>
          ) : null}
          {busy ? <div className="muted form-attach-meta">{uiCopy(lan, 'loading')}</div> : null}
          {error ? <div className="form-attach-error">{error}</div> : null}
        </div>
        {hiddenInputs}
      </div>
    );
  }

  return (
    <div
      className={`form-attach form-attach--file${canUpload ? ' form-attach--editable' : ' form-attach--readonly'}`}
      style={style}
    >
      <div className="form-attach-head">
        {canUpload ? (
          <button
            type="button"
            className="form-attach-cloud"
            title={
              busy
                ? uiCopy(lan, 'loading')
                : mode === 'onSave'
                  ? uiCopy(lan, 'pickFileOnSave')
                  : uiCopy(lan, 'uploadNowDraft')
            }
            disabled={busy || items.length >= max}
            onClick={() => inputRef.current?.click()}
          >
            <CloudUploadIcon />
          </button>
        ) : null}
        {canUpload && !items.length && !busy ? (
          <em className="form-attach-empty-inline">{uiCopy(lan, 'noFile')}</em>
        ) : null}
        {busy ? <span className="muted form-attach-meta">{uiCopy(lan, 'loading')}</span> : null}
      </div>

      {hiddenInputs}
      {error ? <div className="form-attach-error">{error}</div> : null}

      {items.length ? (
        <ul className="form-attach-rows">
          {numbered.map(({ item, idx, n }) => {
            const size = formatSizeKb(item.sizeKb);
            const label = size ? `${item.name} (${size})` : item.name;
            return (
              <li key={`${item.id || item.localId || item.name}-${n}`} className="form-attach-row">
                <span className="form-attach-idx">{n}.</span>
                <button type="button" className="form-attach-name" onClick={() => openFile(item)} title={item.id || item.name}>
                  {label}
                  {item.status === -1 ? (
                    <em className="form-attach-pending">{uiCopy(lan, 'pendingSave')}</em>
                  ) : null}
                  {item.status === 0 ? <em className="form-attach-pending"> · draft</em> : null}
                </button>
                {canUpload ? (
                  <button
                    type="button"
                    className="form-attach-x"
                    title={uiCopy(lan, 'remove')}
                    onClick={() => removeAt(idx)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function resolveOpenAs(raw?: string | null): OpenAsKind | undefined {
  return normalizeOpenAs(raw);
}
