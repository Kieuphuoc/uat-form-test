/** Một điểm trên bản đồ (độ thập phân). */
export type MapPoint = { lat: number; lng: number };

/**
 * Parse chuỗi location form: `"lat1, long1;lat2, long2"`.
 * Chấp nhận khoảng trắng quanh dấu phẩy/chấm phẩy.
 */
export function parseMapLocations(raw: unknown): MapPoint[] {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
  if (!s) return [];
  const out: MapPoint[] = [];
  for (const part of s.split(';')) {
    const chunk = part.trim();
    if (!chunk) continue;
    const sep = chunk.includes(',') ? ',' : /\s+/;
    const bits =
      typeof sep === 'string'
        ? chunk.split(',').map((x) => x.trim())
        : chunk.trim().split(sep);
    if (bits.length < 2) continue;
    const lat = Number(bits[0]);
    const lng = Number(bits[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ lat, lng });
  }
  return out;
}

/** Serialize lại `"lat, lng;lat, lng"`. */
export function formatMapLocations(points: MapPoint[]): string {
  return points.map((p) => `${p.lat}, ${p.lng}`).join(';');
}
