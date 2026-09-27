import { useCallback, useState } from 'react';
import type { ChecklistItem } from '../../types';
import { IconPlus, IconX } from '../icons';
import './NoteChecklist.css';

interface NoteChecklistProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

// Todo-list body for a note in "checklist" mode - check items off,
// edit their text inline, delete on hover, and add new ones from the
// row at the bottom (Enter or the + button).
export function NoteChecklist({ items, onChange }: NoteChecklistProps) {
  const [draft, setDraft] = useState('');

  const toggle = useCallback(
    (id: string) => onChange(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it))),
    [items, onChange],
  );
  const editText = useCallback(
    (id: string, text: string) =>
      onChange(items.map((it) => (it.id === id ? { ...it, text } : it))),
    [items, onChange],
  );
  const remove = useCallback(
    (id: string) => onChange(items.filter((it) => it.id !== id)),
    [items, onChange],
  );
  const addItem = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: crypto.randomUUID(), text, done: false }]);
    setDraft('');
  }, [draft, items, onChange]);

  return (
    <div className="note-checklist">
      {items.map((item) => (
        <div
          key={item.id}
          className={`note-checklist__row ${item.done ? 'note-checklist__row--done' : ''}`}
        >
          <button
            type="button"
            className="note-checklist__check"
            onClick={() => toggle(item.id)}
            aria-label="Toggle item done"
          >
            {item.done && <span className="note-checklist__check-mark" />}
          </button>
          <input
            className="note-checklist__input"
            value={item.text}
            placeholder="List item"
            onChange={(e) => editText(item.id, e.target.value)}
          />
          <button
            type="button"
            className="note-checklist__remove"
            onClick={() => remove(item.id)}
            title="Remove item"
          >
            <IconX size={11} />
          </button>
        </div>
      ))}
      <div className="note-checklist__row note-checklist__row--add">
        <span className="note-checklist__check note-checklist__check--ghost" aria-hidden />
        <input
          className="note-checklist__input"
          value={draft}
          placeholder="Add item..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
          onBlur={addItem}
        />
        {draft && (
          <button
            type="button"
            className="note-checklist__remove note-checklist__remove--add"
            onClick={addItem}
            title="Add item"
          >
            <IconPlus size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
