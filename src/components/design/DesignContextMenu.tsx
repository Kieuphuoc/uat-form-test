type MenuTarget =
  | { kind: 'canvas' }
  | { kind: 'control'; id: string }
  | { kind: 'list'; id: string }
  | { kind: 'column'; listId: string; field: string };

export type ContextMenuState = {
  x: number;
  y: number;
  target: MenuTarget;
};

type Props = {
  menu: ContextMenuState;
  onClose: () => void;
  onAddControl: () => void;
  onAddIconButton?: () => void;
  onAddList: () => void;
  onEditControl: (id: string) => void;
  onCopyControl: (id: string) => void;
  onDeleteControl: (id: string) => void;
  onDeleteList: (id: string) => void;
  onAddColumn: (listId: string) => void;
  onCopyColumn: (listId: string, field: string) => void;
  onDeleteColumn: (listId: string, field: string) => void;
  onSelectColumn: (listId: string, field: string) => void;
  onSelectList: (id: string) => void;
  onSelectControl: (id: string) => void;
  /** Selection hiện tại — dùng khi right-click canvas để Copy focus. */
  focused?:
    | { kind: 'control'; id: string }
    | { kind: 'column'; listId: string; field: string }
    | null;
};

export function DesignContextMenu({
  menu,
  onClose,
  onAddControl,
  onAddIconButton,
  onAddList,
  onEditControl,
  onCopyControl,
  onDeleteControl,
  onDeleteList,
  onAddColumn,
  onCopyColumn,
  onDeleteColumn,
  onSelectColumn,
  onSelectList,
  onSelectControl,
  focused,
}: Props) {
  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const items: { label: string; danger?: boolean; action: () => void }[] = [];

  if (menu.target.kind === 'canvas') {
    items.push(
      { label: 'Thêm control', action: () => run(onAddControl) },
      {
        label: 'Thêm icon button',
        action: () => run(() => (onAddIconButton ? onAddIconButton() : onAddControl())),
      },
      { label: 'Thêm list', action: () => run(onAddList) },
    );
    if (focused?.kind === 'control') {
      items.push({
        label: 'Copy control đang chọn',
        action: () => run(() => onCopyControl(focused.id)),
      });
    }
    if (focused?.kind === 'column') {
      items.push({
        label: 'Copy column đang chọn',
        action: () => run(() => onCopyColumn(focused.listId, focused.field)),
      });
    }
  } else if (menu.target.kind === 'control') {
    const id = menu.target.id;
    items.push(
      {
        label: 'Chọn / mở inspector',
        action: () =>
          run(() => {
            onSelectControl(id);
          }),
      },
      { label: 'Sửa nhãn (F2)', action: () => run(() => onEditControl(id)) },
      { label: 'Copy', action: () => run(() => onCopyControl(id)) },
      { label: 'Xóa', danger: true, action: () => run(() => onDeleteControl(id)) },
    );
  } else if (menu.target.kind === 'list') {
    const id = menu.target.id;
    items.push(
      { label: 'Chọn list', action: () => run(() => onSelectList(id)) },
      { label: 'Thêm cột', action: () => run(() => onAddColumn(id)) },
      { label: 'Xóa list', danger: true, action: () => run(() => onDeleteList(id)) },
    );
  } else if (menu.target.kind === 'column') {
    const { listId, field } = menu.target;
    items.push(
      {
        label: 'Chọn cột',
        action: () => run(() => onSelectColumn(listId, field)),
      },
      {
        label: 'Copy',
        action: () => run(() => onCopyColumn(listId, field)),
      },
      {
        label: 'Xóa cột',
        danger: true,
        action: () => run(() => onDeleteColumn(listId, field)),
      },
    );
  }

  return (
    <>
      <div className="design-ctx-backdrop" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <ul
        className="design-ctx-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it) => (
          <li key={it.label}>
            <button type="button" className={it.danger ? 'danger' : undefined} onClick={it.action}>
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
