import { useCallback, useEffect, useRef } from 'react';
import { sanitizeNoteHtml } from '../../utils/sanitizeHtml';
import { IconBold, IconItalic, IconListBullets } from '../icons';
import './NoteRichText.css';

interface NoteRichTextProps {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (html: string) => void;
}

// Formatted body for a note in "text" mode - a contentEditable div with
// a tiny Bold/Italic/Bullet-list toolbar, backed by the browser's own
// execCommand (Electron ships Chromium, so this stays reliable) and
// sanitized on every change before it's handed back to the caller.
export function NoteRichText({ value, placeholder, autoFocus, onChange }: NoteRichTextProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isFocused = useRef(false);

  // Only sync from props while the user isn't actively editing - otherwise
  // a debounced parent update would fight the caret position.
  useEffect(() => {
    if (isFocused.current || !ref.current || ref.current.innerHTML === value) return;
    ref.current.innerHTML = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleInput = useCallback(() => {
    if (!ref.current) return;
    onChange(sanitizeNoteHtml(ref.current.innerHTML));
  }, [onChange]);

  const format = useCallback(
    (command: 'bold' | 'italic' | 'insertUnorderedList') => {
      ref.current?.focus();
      document.execCommand(command);
      handleInput();
    },
    [handleInput],
  );

  const isEmpty = !value || value === '<br>';

  return (
    <div className="note-rich-text">
      <div className="note-rich-text__toolbar">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => format('bold')}
          title="Bold"
        >
          <IconBold size={12} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => format('italic')}
          title="Italic"
        >
          <IconItalic size={12} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => format('insertUnorderedList')}
          title="Bullet list"
        >
          <IconListBullets size={12} />
        </button>
      </div>
      <div
        ref={ref}
        className="note-rich-text__body"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-empty={isEmpty || undefined}
        onFocus={() => {
          isFocused.current = true;
        }}
        onBlur={() => {
          isFocused.current = false;
          handleInput();
        }}
        onInput={handleInput}
      />
    </div>
  );
}
