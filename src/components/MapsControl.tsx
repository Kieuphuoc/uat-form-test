import { useEffect, useId, useRef, useState } from 'react';
import { requestDeviceGps } from '../lib/deviceGps';
import { formatMapLocations, parseMapLocations, type MapPoint } from '../lib/mapLocations';

type LeafletMap = {
  remove: () => void;
  setView: (center: [number, number], zoom: number) => void;
  fitBounds: (bounds: unknown, opts?: { padding?: [number, number] }) => void;
};

type LeafletModule = {
  map: (el: HTMLElement, opts?: { zoomControl?: boolean }) => LeafletMap & {
    addLayer: (layer: unknown) => void;
  };
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (map: unknown) => void };
  marker: (latlng: [number, number]) => { addTo: (map: unknown) => void };
  latLngBounds: (latlngs: [number, number][]) => unknown;
};

declare global {
  interface Window {
    L?: LeafletModule;
  }
}

let leafletLoadPromise: Promise<LeafletModule> | null = null;

function loadLeaflet(): Promise<LeafletModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const cssId = 'leaflet-css-cdn';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    const existing = document.querySelector('script[data-leaflet]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.L) resolve(window.L);
        else reject(new Error('Leaflet load failed'));
      });
      return;
    }

    const script = document.createElement('script');
    script.dataset.leaflet = '1';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error('Leaflet load failed'));
    };
    script.onerror = () => reject(new Error('Không tải được Leaflet'));
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

type Props = {
  value: unknown;
  height?: string;
  /** Khi value rỗng → lấy GPS hiện tại và ghi ngược (nếu editable / onLocate). */
  autoLocate?: boolean;
  onLocationsChange?: (serialized: string) => void;
};

/** Control maps: value = `"lat, lng;lat, lng"`; rỗng → GPS hiện tại. */
export function MapsControl({ value, height, autoLocate = true, onLocationsChange }: Props) {
  const mapElId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<MapPoint[]>(() => parseMapLocations(value));
  const locatingRef = useRef(false);
  const onChangeRef = useRef(onLocationsChange);
  onChangeRef.current = onLocationsChange;

  useEffect(() => {
    setPoints(parseMapLocations(value));
  }, [value]);

  useEffect(() => {
    const parsed = parseMapLocations(value);
    if (parsed.length > 0 || !autoLocate || locatingRef.current) return;
    locatingRef.current = true;
    setStatus('locating');
    setError(null);
    void requestDeviceGps()
      .then((fix) => {
        const next: MapPoint[] = [{ lat: fix.latitude, lng: fix.longitude }];
        setPoints(next);
        onChangeRef.current?.(formatMapLocations(next));
        setStatus('ready');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      })
      .finally(() => {
        locatingRef.current = false;
      });
  }, [value, autoLocate]);

  useEffect(() => {
    if (!points.length || !containerRef.current) return;
    let cancelled = false;
    let map: LeafletMap | null = null;

    void loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const el = containerRef.current;
        el.innerHTML = '';
        const instance = L.map(el, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(instance);
        const latlngs: [number, number][] = points.map((p) => [p.lat, p.lng]);
        for (const ll of latlngs) {
          L.marker(ll).addTo(instance);
        }
        if (latlngs.length === 1) {
          instance.setView(latlngs[0]!, 16);
        } else {
          instance.fitBounds(L.latLngBounds(latlngs), { padding: [28, 28] });
        }
        map = instance;
        mapRef.current = instance;
        setStatus('ready');
        // Leaflet cần invalidate sau layout
        window.setTimeout(() => {
          try {
            (instance as unknown as { invalidateSize?: () => void }).invalidateSize?.();
          } catch {
            /* ignore */
          }
        }, 80);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        if (mapRef.current === map) mapRef.current = null;
      }
    };
  }, [points]);

  const h = height?.trim() || '220px';

  return (
    <div className="form-maps" style={{ height: h, minHeight: h }}>
      <div ref={containerRef} id={`maps-${mapElId}`} className="form-maps__canvas" />
      {status === 'locating' && (
        <div className="form-maps__overlay">Đang lấy vị trí GPS…</div>
      )}
      {status === 'error' && error && (
        <div className="form-maps__overlay form-maps__overlay--error">{error}</div>
      )}
      {!points.length && status !== 'locating' && status !== 'error' && (
        <div className="form-maps__overlay">Chưa có điểm trên bản đồ</div>
      )}
    </div>
  );
}
