import type { FormMode } from '../types/form';
import { FormIcon } from './form/FormIcon';

/** Icon nhỏ sát phải title — chỉ `new` / `edit` (view không hiện). */
export function FormModeTitleIcon({ mode }: { mode: FormMode | string | undefined }) {
  if (mode !== 'new' && mode !== 'edit') return null;
  const label = mode;
  return (
    <span className={`form-mode-title-icon form-mode-title-icon--${mode}`} title={label} aria-label={label}>
      <FormIcon name={mode === 'edit' ? 'pencil' : 'circle-plus'} size={12} strokeWidth={2} />
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
