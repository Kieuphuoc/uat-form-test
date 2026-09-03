import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { renderTextWithLinks } from '../../lib/linkifyText';
import { IconChevronsDown, IconChevronsUp, IconClose, IconMaximize } from '../AppIcons';

export type ChatMarkdownMedia = {
  renderImage?: (src: string, alt: string) => ReactNode;
  renderLink?: (href: string, label: string) => ReactNode | null;
};

const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#*)?$/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const HR_RE = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

/** Chiều cao clamp trên thread (~10 dòng chat). Ảnh FAQ thường vượt ngưỡng này. */
export const AI_REPLY_MAX_LINES = 10;
const CLAMP_LINE_HEIGHT = 1.45;
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/;

function likelyOverflows(text: string, maxLines: number) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').length;
  return lines > maxLines || MD_IMAGE_RE.test(text);
}

function clampLineHeightPx(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = parseFloat(style.fontSize);
  return (Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14) * CLAMP_LINE_HEIGHT;
}

function watchClampOverflow(
  clip: HTMLElement,
  maxLines: number,
  onChange: (overflows: boolean) => void,
) {
  const imgs = new Set<HTMLImageElement>();
  const measure = () => {
    const content = (clip.firstElementChild as HTMLElement | null) ?? clip;
    const height = Math.max(content.scrollHeight, content.offsetHeight);
    onChange(height > clampLineHeightPx(clip) * maxLines + 1);
  };
  const onImgDone = () => measure();
  const bindImages = () => {
    clip.querySelectorAll('img').forEach((img) => {
      if (imgs.has(img)) return;
      imgs.add(img);
      if (img.complete) return;
      img.addEventListener('load', onImgDone);
      img.addEventListener('error', onImgDone);
    });
  };

  bindImages();
  measure();

  const inner = (clip.firstElementChild as HTMLElement | null) ?? clip;
  const ro = new ResizeObserver(() => {
    bindImages();
    measure();
  });
  ro.observe(inner);
  if (inner !== clip) ro.observe(clip);

  const mo = new MutationObserver(() => {
    bindImages();
    measure();
  });
  mo.observe(clip, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  return () => {
    ro.disconnect();
    mo.disconnect();
    imgs.forEach((img) => {
      img.removeEventListener('load', onImgDone);
      img.removeEventListener('error', onImgDone);
    });
  };
}

function isSafeHttpSrc(src: string) {
  return src.startsWith('https://') || src.startsWith('http://') || src.startsWith('/');
}

function inlineMarkdown(text: string, media?: ChatMarkdownMedia): ReactNode[] {
  const pattern =
    /(!\[[^\]]*\]\([^)]+\))|(`[^`]+`)|(~~[^~]+~~)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(...renderTextWithLinks(text.slice(last, match.index), `md-${key++}`));
    const token = match[0];
    if (token.startsWith('![')) {
      const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      const alt = img?.[1] ?? '';
      const src = img?.[2]?.trim() ?? '';
      if (media?.renderImage) {
        nodes.push(<Fragment key={key++}>{media.renderImage(src, alt)}</Fragment>);
      } else if (isSafeHttpSrc(src)) {
        nodes.push(<img key={key++} src={src} alt={alt} />);
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('`')) {
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
      const label = link?.[1] ?? href;
      const custom = media?.renderLink?.(href, label);
      if (custom != null) {
        nodes.push(<Fragment key={key++}>{custom}</Fragment>);
      } else if (isSafeHttpSrc(href)) {
        nodes.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>,
        );
      } else {
        nodes.push(token);
      }
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

function renderListItems(
  lines: string[],
  startKey: number,
  media?: ChatMarkdownMedia,
): { node: ReactNode; used: number } {
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
    const content = inlineMarkdown(parsed[3], media);
    i += 1;
    let nested: ReactNode = null;
    if (i < lines.length) {
      const next = LIST_RE.exec(lines[i]);
      if (next && next[1].length > baseIndent) {
        const child = renderListItems(lines.slice(i), key + 100, media);
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

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  media,
}: {
  text: string;
  media?: ChatMarkdownMedia;
}) {
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
      blocks.push(<Tag key={key++}>{inlineMarkdown(heading[2], media)}</Tag>);
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
                <th key={idx}>{inlineMarkdown(cell, media)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ridx) => (
              <tr key={ridx}>
                {headers.map((_, cidx) => (
                  <td key={cidx}>{inlineMarkdown(row[cidx] ?? '', media)}</td>
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
      blocks.push(<blockquote key={key++}>{inlineMarkdown(quoted.join('\n'), media)}</blockquote>);
      continue;
    }
    if (LIST_RE.test(line)) {
      const rest = lines.slice(i);
      const list = renderListItems(rest, key, media);
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
    blocks.push(<p key={key++}>{inlineMarkdown(line, media)}</p>);
    i += 1;
  }
  return <div className="chat-md">{blocks}</div>;
});

export const ChatContentClamped = memo(function ChatContentClamped({
  maxLines = AI_REPLY_MAX_LINES,
  resetKey,
  onOpenLarge,
  children,
}: {
  maxLines?: number;
  resetKey: string;
  onOpenLarge: () => void;
  children: ReactNode;
}) {
  const clipRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(() => likelyOverflows(resetKey, maxLines));

  useLayoutEffect(() => {
    setExpanded(false);
    setOverflows(likelyOverflows(resetKey, maxLines));
    const el = clipRef.current;
    if (!el) return;
    return watchClampOverflow(el, maxLines, setOverflows);
  }, [resetKey, maxLines]);

  return (
    <div className="chat-md-clip-wrap">
      <div
        ref={clipRef}
        className={`chat-md-clip${expanded ? '' : ' chat-md-clip--clamp'}${
          !expanded && overflows ? ' chat-md-clip--fade' : ''
        }`}
        style={!expanded ? ({ '--chat-md-clamp-lines': maxLines } as CSSProperties) : undefined}
      >
        <div className="chat-md-clip-inner">{children}</div>
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
            onClick={onOpenLarge}
          >
            <IconMaximize size={14} />
            <span>Xem lớn</span>
          </button>
        </div>
      )}
    </div>
  );
});

export const ChatMarkdownClamped = memo(function ChatMarkdownClamped({
  text,
  maxLines = AI_REPLY_MAX_LINES,
  onOpenLarge,
  media,
}: {
  text: string;
  maxLines?: number;
  onOpenLarge: (text: string) => void;
  media?: ChatMarkdownMedia;
}) {
  return (
    <ChatContentClamped
      maxLines={maxLines}
      resetKey={text}
      onOpenLarge={() => onOpenLarge(text)}
    >
      <ChatMarkdown text={text} media={media} />
    </ChatContentClamped>
  );
});

export function ChatMarkdownViewer({
  title,
  text,
  onClose,
  media,
}: {
  title: string;
  text: string;
  onClose: () => void;
  media?: ChatMarkdownMedia;
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
          <ChatMarkdown text={text} media={media} />
        </div>
      </div>
    </div>
  );
}
