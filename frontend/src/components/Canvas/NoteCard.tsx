import { useCallback, useRef, useState } from 'react';
import { useDebouncedSave } from '../../hooks/useDebouncedSave';
import type { BoardNoteItem, BoardNoteUpdate, ChecklistItem } from '../../types';
import { stopWheelIfScrollable } from '../../utils/scrollChain';
import {
  IconCheckSquare,
  IconChevronDown,
  IconChevronUp,
  IconDroplet,
  IconPin,
  IconTag,
  IconTextLines,
  IconX,
} from '../icons';
import { NoteChecklist } from './NoteChecklist';
import { NoteRichText } from './NoteRichText';
import './NoteCard.css';

// Accent palette keys (persisted on the note) - colors themselves live
// in NoteCard.css so they stay readable in both themes.
const NOTE_COLORS = ['yellow', 'blue', 'pink', 'green', 'purple', 'surface'] as const;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 110;
const DEFAULT_HEIGHT = 220;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface NoteCardProps {
  note: BoardNoteItem;
  scaleRef: React.RefObject<number>;
  autoFocus: boolean;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, update: BoardNoteUpdate) => void;
  onRemove: (id: string) => void;
}

// Standalone note on the board - drags by its body, resizes from the
// bottom-right corner, edits a title + formatted body (or a checklist),
// carries tags and an optional reference color swatch, and can be
// pinned in place or collapsed to a compact chip.
export function NoteCard({ note, scaleRef, autoFocus, onMove, onUpdate, onRemove }: NoteCardProps) {
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  const resizeState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(
    null,
  );
  const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const swatchInputRef = useRef<HTMLInputElement | null>(null);

  const saveTitle = useCallback((title: string) => onUpdate(note.id, { title }), [note.id, onUpdate]);
  const [draftTitle, setDraftTitle] = useDebouncedSave(note.title, saveTitle);

  const saveText = useCallback((text: string) => onUpdate(note.id, { text }), [note.id, onUpdate]);
  const [draftText, setDraftText] = useDebouncedSave(note.text, saveText);

  const saveChecklist = useCallback(
    (checklist: ChecklistItem[]) => onUpdate(note.id, { checklist }),
    [note.id, onUpdate],
  );
  const [draftChecklist, setDraftChecklist] = useDebouncedSave(note.checklist, saveChecklist);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Editable fields, buttons, and the resize handle stay interactive;
      // grabbing anywhere else on the note moves it (unless pinned).
      if ((e.target as HTMLElement).closest('textarea, input, button, [contenteditable="true"]'))
        return;
      e.stopPropagation();
      if (note.pinned) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragState.current = { startX: e.clientX, startY: e.clientY, originX: note.x, originY: note.y };
    },
    [note.pinned, note.x, note.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const { startX, startY, originX, originY } = dragState.current;
      const zoom = scaleRef.current ?? 1;
      onMove(note.id, originX + (e.clientX - startX) / zoom, originY + (e.clientY - startY) / zoom);
    },
    [note.id, onMove, scaleRef],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragState.current = null;
  }, []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: note.width || 240,
        startH: note.height ?? DEFAULT_HEIGHT,
      };
    },
    [note.width, note.height],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeState.current) return;
      const { startX, startY, startW, startH } = resizeState.current;
      const zoom = scaleRef.current ?? 1;
      setLiveSize({
        width: Math.max(MIN_WIDTH, startW + (e.clientX - startX) / zoom),
        height: Math.max(MIN_HEIGHT, startH + (e.clientY - startY) / zoom),
      });
    },
    [scaleRef],
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      resizeState.current = null;
      setLiveSize((size) => {
        if (size) onUpdate(note.id, { width: size.width, height: size.height });
        return null;
      });
    },
    [note.id, onUpdate],
  );

  const addTag = useCallback(() => {
    const value = tagDraft.trim();
    if (value && !note.tags.includes(value)) onUpdate(note.id, { tags: [...note.tags, value] });
    setTagDraft('');
  }, [tagDraft, note.tags, note.id, onUpdate]);

  const removeTag = useCallback(
    (tag: string) => onUpdate(note.id, { tags: note.tags.filter((t) => t !== tag) }),
    [note.tags, note.id, onUpdate],
  );

  const openSwatchPicker = useCallback(() => swatchInputRef.current?.click(), []);
  const handleSwatchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onUpdate(note.id, { swatch: e.target.value }),
    [note.id, onUpdate],
  );

  const color = NOTE_COLORS.includes(note.color as (typeof NOTE_COLORS)[number])
    ? note.color
    : 'yellow';

  if (note.collapsed) {
    const preview =
      note.title || (note.mode === 'checklist' ? note.checklist[0]?.text : stripHtml(note.text)) ||
      'Untitled note';
    return (
      <div
        className="note-card note-card--collapsed"
        data-color={color}
        style={{ left: note.x, top: note.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="note-card__accent" />
        <span className="note-card__collapsed-text">{preview}</span>
        <button
          type="button"
          className="note-card__icon-btn"
          onClick={() => onUpdate(note.id, { collapsed: false })}
          title="Expand note"
        >
          <IconChevronDown size={14} />
        </button>
      </div>
    );
  }

  const width = liveSize?.width ?? note.width ?? 240;
  const height = liveSize?.height ?? note.height ?? undefined;

  return (
    <div
      className="note-card"
      data-color={color}
      style={{ left: note.x, top: note.y, width, ...(height ? { height } : {}) }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="note-card__accent" />

      {/* Structural controls only - what happens to the note itself.
          Always visible (dimmed at rest) so they're never a mystery. */}
      <div className="note-card__header">
        <button
          type="button"
          className={`note-card__icon-btn ${note.pinned ? 'note-card__icon-btn--active' : ''}`}
          onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
          title={note.pinned ? 'Unpin note' : 'Pin note in place'}
        >
          <IconPin size={14} />
        </button>
        <input
          className="note-card__title"
          value={draftTitle}
          placeholder="Untitled note"
          onChange={(e) => setDraftTitle(e.target.value)}
        />
        <button
          type="button"
          className="note-card__icon-btn"
          onClick={() => onUpdate(note.id, { collapsed: true })}
          title="Collapse note"
        >
          <IconChevronUp size={14} />
        </button>
        <button
          type="button"
          className="note-card__icon-btn note-card__icon-btn--danger"
          onClick={() => onRemove(note.id)}
          title="Delete note"
        >
          <IconX size={14} />
        </button>
      </div>

      {(note.tags.length > 0 || showTagInput) && (
        <div className="note-card__tags">
          {note.tags.map((tag) => (
            <span key={tag} className="note-card__tag">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} title="Remove tag">
                <IconX size={9} />
              </button>
            </span>
          ))}
          {showTagInput && (
            <input
              autoFocus
              className="note-card__tag-input"
              value={tagDraft}
              placeholder="tag + Enter"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                  setShowTagInput(false);
                } else if (e.key === 'Escape') {
                  setTagDraft('');
                  setShowTagInput(false);
                }
              }}
              onBlur={() => {
                addTag();
                setShowTagInput(false);
              }}
            />
          )}
        </div>
      )}

      {note.swatch && (
        <button
          type="button"
          className="note-card__swatch"
          style={{ '--swatch-color': note.swatch } as React.CSSProperties}
          onClick={openSwatchPicker}
          title={`${note.swatch} - click to change`}
        >
          <span className="note-card__swatch-dot" />
          <span className="note-card__swatch-hex">{note.swatch}</span>
          <span
            className="note-card__swatch-remove"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(note.id, { swatch: '' });
            }}
          >
            <IconX size={9} />
          </span>
        </button>
      )}

      <div className="note-card__body" onWheel={stopWheelIfScrollable}>
        {note.mode === 'checklist' ? (
          <NoteChecklist items={draftChecklist} onChange={setDraftChecklist} />
        ) : (
          <NoteRichText
            value={draftText}
            placeholder="Write a note..."
            autoFocus={autoFocus}
            onChange={setDraftText}
          />
        )}
      </div>

      {/* Content actions - what to add to the note. Grouped and labeled
          so each control reads on its own, no icon-guessing required. */}
      <div className="note-card__footer">
        <div className="note-card__palette">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`note-card__dot note-card__dot--${c} ${c === color ? 'note-card__dot--active' : ''}`}
              title={`${c} note`}
              onClick={() => onUpdate(note.id, { color: c })}
            />
          ))}
        </div>
        <span className="note-card__divider" />
        <div className="note-card__mode-switch">
          <button
            type="button"
            className={note.mode !== 'checklist' ? 'note-card__mode-btn--active' : ''}
            onClick={() => onUpdate(note.id, { mode: 'text' })}
            title="Text note"
          >
            <IconTextLines size={13} />
          </button>
          <button
            type="button"
            className={note.mode === 'checklist' ? 'note-card__mode-btn--active' : ''}
            onClick={() => onUpdate(note.id, { mode: 'checklist' })}
            title="Checklist"
          >
            <IconCheckSquare size={13} />
          </button>
        </div>
        <span className="note-card__divider" />
        <button
          type="button"
          className="note-card__footer-btn"
          onClick={() => setShowTagInput(true)}
          title="Add a tag"
        >
          <IconTag size={13} />
          Tag
        </button>
        <button
          type="button"
          className="note-card__footer-btn"
          onClick={openSwatchPicker}
          title="Attach a reference color"
        >
          <IconDroplet size={13} />
          Color
        </button>
        <input
          ref={swatchInputRef}
          type="color"
          value={note.swatch || '#8cb3e8'}
          onChange={handleSwatchChange}
          className="note-card__swatch-input"
        />
      </div>

      <div
        className="note-card__resize"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />
    </div>
  );
}
