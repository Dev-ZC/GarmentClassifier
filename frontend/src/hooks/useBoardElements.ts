import { useCallback, useState } from 'react';
import * as api from '../api/client';
import type { BoardElementItem, BoardElementKind, BoardElementUpdate } from '../types';

/**
 * State + CRUD for a board's floating elements (text labels, shapes,
 * arrows). Kept separate from useBoards so the notes/images plumbing
 * stays readable; useBoards composes this and triggers loadElements
 * alongside its own refresh.
 */
export function useBoardElements(
  activeBoardId: string | null,
  onError: (message: string) => void,
) {
  const [boardElements, setBoardElements] = useState<BoardElementItem[]>([]);
  // The element the user just created - text elements autofocus so
  // typing can start immediately (cleared on board switch/refresh).
  const [focusElementId, setFocusElementId] = useState<string | null>(null);

  const loadElements = useCallback(async (boardId: string) => {
    const elements = await api.listBoardElements(boardId);
    setBoardElements(elements);
    setFocusElementId(null);
  }, []);

  const clearElements = useCallback(() => {
    setBoardElements([]);
    setFocusElementId(null);
  }, []);

  const addElement = useCallback(
    async (kind: BoardElementKind, x: number, y: number) => {
      if (!activeBoardId) return;
      try {
        const element = await api.createBoardElement(activeBoardId, kind, x, y);
        setBoardElements((prev) => [...prev, element]);
        setFocusElementId(element.id);
      } catch (err) {
        onError((err as Error).message);
      }
    },
    [activeBoardId, onError],
  );

  // Same optimistic pattern as notes/images: local first, the PATCH
  // catches up (moves fire one PATCH per pointermove, like placements).
  // A 404 is swallowed: debounced text saves can land after the element
  // was already removed (empty text deletes itself on blur).
  const updateElement = useCallback(
    (id: string, update: BoardElementUpdate) => {
      setBoardElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, ...update } : el)),
      );
      if (activeBoardId) {
        api.updateBoardElement(activeBoardId, id, update).catch((err: Error) => {
          if (!/not found/i.test(err.message)) onError(err.message);
        });
      }
    },
    [activeBoardId, onError],
  );

  const removeElement = useCallback(
    (id: string) => {
      setBoardElements((prev) => prev.filter((el) => el.id !== id));
      if (activeBoardId) {
        // 404 is fine - an empty text label can blur-delete itself right
        // as its delete button is clicked.
        api.deleteBoardElement(activeBoardId, id).catch((err: Error) => {
          if (!/not found/i.test(err.message)) onError(err.message);
        });
      }
    },
    [activeBoardId, onError],
  );

  return {
    boardElements,
    focusElementId,
    loadElements,
    clearElements,
    addElement,
    updateElement,
    removeElement,
  };
}
