/** GPS fix — khớp mobile `GpsFix` / Test & Debug. */
export type DeviceGpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  timestamp: number;
};

const GPS_REQUEST = 'arito-form-gps-request';
const GPS_RESULT = 'arito-form-gps-result';

type GpsResultMessage = {
  type?: string;
  requestId?: string;
  ok?: boolean;
  data?: DeviceGpsFix;
  error?: string;
};

function browserGeolocation(timeoutMs: number): Promise<DeviceGpsFix> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Trình duyệt không hỗ trợ Geolocation.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          altitude: pos.coords.altitude ?? null,
          timestamp: pos.timestamp,
        });
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          reject(new Error('Bạn đã từ chối quyền vị trí. Hãy cho phép Location.'));
        } else if (e.code === e.POSITION_UNAVAILABLE) {
          reject(new Error('Không lấy được GPS. Hãy bật Location / GPS rồi thử lại.'));
        } else if (e.code === e.TIMEOUT) {
          reject(new Error('Hết thời gian chờ GPS. Thử lại ở nơi thoáng hơn.'));
        } else {
          reject(new Error(e.message || 'Lỗi GPS'));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

function requestFromParent(timeoutMs: number): Promise<DeviceGpsFix> {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.reject(new Error('Không có shell parent'));
  }
  const requestId = `gps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Shell không phản hồi GPS'));
    }, Math.min(timeoutMs, 8_000));

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as GpsResultMessage | null;
      if (!msg || msg.type !== GPS_RESULT || msg.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (msg.ok && msg.data) {
        resolve(msg.data);
        return;
      }
      reject(new Error(msg.error || 'Không lấy được GPS từ thiết bị'));
    };

    window.addEventListener('message', onMessage);
    try {
      window.parent.postMessage(
        {
          type: GPS_REQUEST,
          requestId,
          options: { enableHighAccuracy: true, timeoutMs },
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

/**
 * GPS độ chính xác cao: ưu tiên Capacitor qua shell mobile (postMessage),
 * fallback `navigator.geolocation` (browser / WebView đã cấp quyền).
 */
export async function requestDeviceGps(opts?: {
  timeoutMs?: number;
}): Promise<DeviceGpsFix> {
  const timeoutMs = opts?.timeoutMs ?? 20_000;
  try {
    return await requestFromParent(timeoutMs);
  } catch {
    return browserGeolocation(timeoutMs);
  }
}

export function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}
