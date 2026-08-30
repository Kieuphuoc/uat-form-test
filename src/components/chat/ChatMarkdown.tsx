import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { renderTextWithLinks } from '../../lib/linkifyText';
import { IconChevronsDown, IconChevronsUp, IconClose, IconMaximize } from '../AppIcons';

const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#*)?$/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const HR_RE = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export const AI_REPLY_MAX_LINES = 20;

function inlineMarkdown(text: string): ReactNode[] {
  const pattern =
    /(`[^`]+`)|(~~[^~]+~~)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(...renderTextWithLinks(text.slice(last, match.index), `md-${key++}`));
    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key++}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith('***')) {
      nodes.push(
        <strong key={key++}>
          <em>{token.slice(3, -3)}</em>
        </strong>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/.exec(token);
      const href = link?.[2]?.trim() ?? '';
      const safe = href.startsWith('https://') || href.startsWith('http://') || href.startsWith('/');
      nodes.push(
        safe ? (
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
            {link?.[1] ?? href}
          </a>
        ) : (
          token
        ),
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(...renderTextWithLinks(text.slice(last), `md-tail-${key}`));
  return nodes;
}

function headingTag(level: number): 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  if (level <= 1) return 'h1';
  if (level === 2) return 'h2';
  if (level === 3) return 'h3';
  if (level === 4) return 'h4';
  if (level === 5) return 'h5';
  return 'h6';
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function renderListItems(lines: string[], startKey: number): { node: ReactNode; used: number } {
  const first = LIST_RE.exec(lines[0]);
  if (!first) return { node: null, used: 0 };
  const ordered = /^\d+\.$/.test(first[2]);
  const baseIndent = first[1].length;
  const items: ReactNode[] = [];
  let i = 0;
  let key = startKey;
  while (i < lines.length) {
    const parsed = LIST_RE.exec(lines[i]);
    if (!parsed) break;
    const indent = parsed[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) break;
    const sameKind = /^\d+\.$/.test(parsed[2]) === ordered;
    if (!sameKind) break;
    const content = inlineMarkdown(parsed[3]);
    i += 1;
    let nested: ReactNode = null;
    if (i < lines.length) {
      const next = LIST_RE.exec(lines[i]);
      if (next && next[1].length > baseIndent) {
        const child = renderListItems(lines.slice(i), key + 100);
        nested = child.node;
        i += child.used;
      }
    }
    items.push(
      <li key={key++}>
        {content}
        {nested}
      </li>,
    );
  }
  const Tag = ordered ? 'ol' : 'ul';
  return { node: <Tag key={startKey}>{items}</Tag>, used: i };
}

export const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  const source = text.replace(/\r\n/g, '\n');
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre key={key++}>
          <code data-lang={lang || undefined}>{code.join('\n')}</code>
        </pre>,
      );
      i += 1;
      continue;
    }
    if (HR_RE.test(line) && !LIST_RE.test(line)) {
      blocks.push(<hr key={key++} />);
      i += 1;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const Tag = headingTag(heading[1].length);
      blocks.push(<Tag key={key++}>{inlineMarkdown(heading[2])}</Tag>);
      i += 1;
      continue;
    }
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const headers = splitTableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        rows.push(splitTableCells(lines[i]));
        i += 1;
      }
      blocks.push(
        <table key={key++}>
          <thead>
            <tr>
              {headers.map((cell, idx) => (
                <th key={idx}>{inlineMarkdown(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ridx) => (
              <tr key={ridx}>
                {headers.map((_, cidx) => (
                  <td key={cidx}>{inlineMarkdown(row[cidx] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(QUOTE_RE.exec(lines[i])?.[1] ?? '');
        i += 1;
      }
      blocks.push(<blockquote key={key++}>{inlineMarkdown(quoted.join('\n'))}</blockquote>);
      continue;
    }
    if (LIST_RE.test(line)) {
      const rest = lines.slice(i);
      const list = renderListItems(rest, key);
      if (list.node && list.used > 0) {
        blocks.push(list.node);
        key += list.used + 1;
        i += list.used;
        continue;
      }
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    blocks.push(<p key={key++}>{inlineMarkdown(line)}</p>);
    i += 1;
  }
  return <div className="chat-md">{blocks}</div>;
});

export const ChatMarkdownClamped = memo(function ChatMarkdownClamped({
  text,
  maxLines = AI_REPLY_MAX_LINES,
  onOpenLarge,
}: {
  text: string;
  maxLines?: number;
  onOpenLarge: (text: string) => void;
}) {
  const clipRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(
    () => text.replace(/\r\n/g, '\n').split('\n').length > maxLines,
  );

  useLayoutEffect(() => {
    if (expanded) return;
    const el = clipRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded, maxLines]);

  return (
    <div className="chat-md-clip-wrap">
      <div
        ref={clipRef}
        className={`chat-md-clip${expanded ? '' : ' chat-md-clip--clamp'}${
          !expanded && overflows ? ' chat-md-clip--fade' : ''
        }`}
        style={!expanded ? ({ '--chat-md-clamp-lines': maxLines } as CSSProperties) : undefined}
      >
        <ChatMarkdown text={text} />
      </div>
      {(overflows || expanded) && (
        <div className="chat-md-toolbar">
          {overflows && (
            <button
              type="button"
              className="chat-md-tool"
              title={expanded ? 'Thu gọn' : 'Xem thêm — xem toàn bộ'}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <IconChevronsUp size={14} /> : <IconChevronsDown size={14} />}
              <span>{expanded ? 'Thu gọn' : 'Xem thêm'}</span>
            </button>
          )}
          <button
            type="button"
            className="chat-md-tool"
            title="Xem lớn — xem toàn bộ trên form markdown riêng"
            onClick={() => onOpenLarge(text)}
          >
            <IconMaximize size={14} />
            <span>Xem lớn</span>
          </button>
        </div>
      )}
    </div>
  );
});

export function ChatMarkdownViewer({
  title,
  text,
  onClose,
}: {
  title: string;
  text: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="chat-modal-backdrop chat-md-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="chat-modal chat-md-viewer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="chat-modal-head">
          <strong>{title}</strong>
          <button type="button" className="chat-icon-btn" title="Đóng" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </header>
        <div className="chat-md-viewer-body">
          <ChatMarkdown text={text} />
        </div>
      </div>
    </div>
  );
}
