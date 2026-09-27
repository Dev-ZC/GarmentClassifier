import { useEffect, useRef, useState } from 'react';

/**
 * Local draft state that flushes to `onSave` after `delay` ms of
 * inactivity (and immediately on unmount if something is unsaved) - the
 * same debounce-then-flush pattern NoteCard/ImageCard use for text
 * fields, generalized so every per-keystroke field on a note (title,
 * body, checklist) can share it instead of re-implementing it.
 */
export function useDebouncedSave<T>(
  value: T,
  onSave: (value: T) => void,
  delay = 500,
): [T, (next: T) => void] {
  const [draft, setDraft] = useState(value);
  const savedRef = useRef(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // An external update (a different field on the same note changed and
  // re-spread the whole object) shouldn't clobber an in-flight edit.
  useEffect(() => {
    if (value !== savedRef.current && value !== draftRef.current) {
      savedRef.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === savedRef.current) return;
    const timer = setTimeout(() => {
      savedRef.current = draft;
      onSave(draft);
    }, delay);
    return () => clearTimeout(timer);
  }, [draft, onSave, delay]);

  useEffect(
    () => () => {
      if (draftRef.current !== savedRef.current) onSave(draftRef.current);
    },
    [onSave],
  );

  return [draft, setDraft];
}
