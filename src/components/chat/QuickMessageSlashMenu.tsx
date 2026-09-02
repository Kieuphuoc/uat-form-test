import type { QuickMessage } from '../../api/chatApi';

export type SlashPick = {
  code: string;
  label: string;
  insert: string;
  description?: string;
};

export function quickSlashPicks(messages: QuickMessage[]): SlashPick[] {
  return messages.map((item) => ({
    code: item.code,
    label: item.code,
    insert: `/${item.code} `,
    description: item.body_text.length > 80 ? `${item.body_text.slice(0, 80)}…` : item.body_text,
  }));
}

export function detectComposerSlash(value: string, caret: number): { start: number; query: string } | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;
  return { start: beforeCaret.lastIndexOf('/'), query: match[1] };
}

export function filterSlashPicks(items: SlashPick[], query: string): SlashPick[] {
  const q = query.toLocaleLowerCase('vi');
  return items
    .filter(
      (item) =>
        item.code.toLocaleLowerCase('vi').includes(q) ||
        item.label.toLocaleLowerCase('vi').includes(q),
    )
    .slice(0, 8);
}

export function insertSlashPick(
  draft: string,
  start: number,
  caret: number,
  insert: string,
): { next: string; caret: number } {
  return {
    next: `${draft.slice(0, start)}${insert}${draft.slice(caret)}`,
    caret: start + insert.length,
  };
}

export function QuickMessageSlashMenu({
  items,
  activeIndex,
  onChoose,
  onHover,
}: {
  items: SlashPick[];
  activeIndex: number;
  onChoose: (item: SlashPick) => void;
  onHover?: (index: number) => void;
}) {
  return (
    <div className="chat-mention-menu chat-slash-menu" role="listbox" aria-label="Tin nhắn nhanh">
      {items.length > 0 ? (
        items.map((item, index) => (
          <button
            key={item.code}
            type="button"
            className={index === activeIndex ? 'is-active' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover?.(index)}
            onClick={() => onChoose(item)}
            role="option"
            aria-selected={index === activeIndex}
          >
            <span className="chat-slash-code">/{item.label}</span>
            {item.description ? <small>{item.description}</small> : null}
          </button>
        ))
      ) : (
        <span className="chat-mention-empty">Không có mục phù hợp.</span>
      )}
    </div>
  );
}
