import type { FormMode } from '../types/form';

function EditModeSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M11.4 2.6a1.2 1.2 0 0 1 1.7 1.7L5.5 12H3.2v-2.3L11.4 2.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Plus trong vòng tròn — gọn hơn dấu + thô. */
function NewModeSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M8 5v6M5 8h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Icon nhỏ sát phải title — chỉ `new` / `edit` (view không hiện). */
export function FormModeTitleIcon({ mode }: { mode: FormMode | string | undefined }) {
  if (mode !== 'new' && mode !== 'edit') return null;
  const label = mode;
  return (
    <span className={`form-mode-title-icon form-mode-title-icon--${mode}`} title={label} aria-label={label}>
      {mode === 'edit' ? <EditModeSvg /> : <NewModeSvg />}
    </span>
  );
}

/** `title [icon]` — icon ngay sau title, không nằm cạnh nút header. */
export function FormTitleWithMode({
  mode,
  text,
}: {
  mode?: FormMode | string | undefined;
  text: string;
}) {
  return (
    <span className="form-title-with-mode">
      <span className="form-title-with-mode__text">{text}</span>
      <FormModeTitleIcon mode={mode} />
    </span>
  );
}
