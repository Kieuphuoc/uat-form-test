import { useMemo, useRef, type ChangeEvent, type UIEvent } from 'react';
import { highlightCode, type HighlightLang } from '../lib/codeHighlight';

export type CodeEditorTheme = 'light' | 'dark';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  spellCheck?: boolean;
  theme?: CodeEditorTheme;
  language?: HighlightLang;
  placeholder?: string;
};

/**
 * Editor tô màu: pre.hljs phía dưới + textarea trong suốt phía trên.
 */
export function CodeEditor({
  value,
  onChange,
  onBlur,
  className,
  spellCheck = false,
  theme = 'light',
  language = 'json',
  placeholder,
}: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const html = useMemo(() => highlightCode(value || ' ', language), [value, language]);

  const syncScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };

  return (
    <div
      className={`json-code-editor json-code-editor--${theme}${className ? ` ${className}` : ''}`}
    >
      <pre ref={preRef} className="json-code-editor__pre" aria-hidden>
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {'\n'}
      </pre>
      <textarea
        ref={taRef}
        className="json-code-editor__ta"
        value={value}
        placeholder={placeholder}
        spellCheck={spellCheck}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onScroll={syncScroll}
        onBlur={onBlur}
      />
    </div>
  );
}

/** Alias tương thích chỗ cũ. */
export { CodeEditor as JsonCodeEditor };
export type { CodeEditorTheme as JsonEditorTheme };
