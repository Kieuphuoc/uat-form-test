const IMAGE_REQUEST = 'arito-form-image-request';
const IMAGE_RESULT = 'arito-form-image-result';

type ImageResultMessage = {
  type?: string;
  requestId?: string;
  ok?: boolean;
  error?: string;
  files?: { name: string; mimeType: string; base64: string }[];
};

function base64ToFile(name: string, mimeType: string, base64: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mimeType || 'image/jpeg' });
}

/**
 * Xin shell parent (Mini App / mobile) chọn ảnh — fail nếu không có parent bridge.
 */
export function requestImagesFromParent(opts?: {
  count?: number;
  sourceType?: ('album' | 'camera')[];
  cameraType?: 'back' | 'front';
  timeoutMs?: number;
}): Promise<File[]> {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.reject(new Error('Không có shell parent'));
  }

  const requestId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Shell không phản hồi chọn ảnh'));
    }, timeoutMs);

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as ImageResultMessage | null;
      if (!msg || msg.type !== IMAGE_RESULT || msg.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (!msg.ok || !msg.files?.length) {
        reject(new Error(msg.error || 'Không chọn được ảnh từ thiết bị'));
        return;
      }
      try {
        resolve(msg.files.map((f) => base64ToFile(f.name, f.mimeType, f.base64)));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    window.addEventListener('message', onMessage);
    try {
      window.parent.postMessage(
        {
          type: IMAGE_REQUEST,
          requestId,
          options: {
            count: opts?.count ?? 1,
            sourceType: opts?.sourceType,
            cameraType: opts?.cameraType,
          },
        },
        '*',
      );
    } catch (e) {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
