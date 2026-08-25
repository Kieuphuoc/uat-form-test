import type { FormMode } from '../types/form';

const ICONS: Record<'edit' | 'new', { icon: string; label: string }> = {
  edit: { icon: '✎', label: 'edit' },
  new: { icon: '+', label: 'new' },
};

/** Icon trái tiêu đề — chỉ `new` / `edit` (view không hiện). */
export function FormModeTitleIcon({ mode }: { mode: FormMode | string | undefined }) {
  if (mode !== 'new' && mode !== 'edit') return null;
  const { icon, label } = ICONS[mode];
  return (
    <span className={`form-mode-title-icon form-mode-title-icon--${mode}`} title={label} aria-label={label}>
      {icon}
    </span>
  );
}

export function FormTitleWithMode({
  mode,
  text,
}: {
  mode: FormMode | string | undefined;
  text: string;
}) {
  return (
    <span className="form-title-with-mode">
      <FormModeTitleIcon mode={mode} />
      <span className="form-title-with-mode__text">{text}</span>
    </span>
  );
}

