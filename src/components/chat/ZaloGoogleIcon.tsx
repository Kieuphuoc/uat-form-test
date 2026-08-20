import type { ZaloGoogleLinkKind } from '../../lib/zaloChat';

const META: Record<ZaloGoogleLinkKind, { label: string; color: string }> = {
  docs: { label: 'Docs', color: '#4285F4' },
  sheets: { label: 'Sheets', color: '#0F9D58' },
  slides: { label: 'Slides', color: '#F4B400' },
  drive: { label: 'Drive', color: '#4285F4' },
  forms: { label: 'Forms', color: '#673AB7' },
};

export function ZaloGoogleIcon({ kind, size = 18 }: { kind: ZaloGoogleLinkKind; size?: number }) {
  const meta = META[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className="zalo-google-icon-svg"
    >
      <rect width="24" height="24" rx="4" fill={meta.color} />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fill="#fff"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="Segoe UI, system-ui, sans-serif"
      >
        {meta.label}
      </text>
    </svg>
  );
}
