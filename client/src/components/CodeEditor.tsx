import { useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';

/** Code editor with line numbers. `readOnly` shows the buggy code the student has to fix. */
export function CodeEditor({
  label,
  tone,
  value,
  onChange,
  readOnly,
  placeholder,
  tall,
}: {
  label: string;
  tone: 'bug' | 'fix';
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  tall?: boolean;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = Math.max(1, value.split('\n').length);
  const nums = useMemo(() => Array.from({ length: Math.max(lines, 14) }, (_, i) => i + 1).join('\n'), [lines]);
  const sync = (el: HTMLElement) => {
    if (gutter.current) gutter.current.scrollTop = el.scrollTop;
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || !onChange) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: en } = el;
    onChange(value.slice(0, s) + '    ' + value.slice(en));
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = s + 4;
    });
  };
  return (
    <div className={`editor ${tall ? 'tall' : ''}`}>
      <div className="editor-head">
        <span className={tone}>{label}</span>
        <span>{lines} lines</span>
      </div>
      <div className="editor-main">
        <div className="gutter" ref={gutter} aria-hidden="true">
          {nums}
        </div>
        {readOnly ? (
          <pre onScroll={(e) => sync(e.currentTarget)}>{value}</pre>
        ) : (
          <textarea
            value={value}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            onScroll={(e) => sync(e.currentTarget)}
            onKeyDown={onKey}
            autoCapitalize="off"
            autoCorrect="off"
          />
        )}
      </div>
    </div>
  );
}

