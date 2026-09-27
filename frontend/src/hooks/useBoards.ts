import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { useBoardElements } from './useBoardElements';
import type { BoardImageItem, BoardItem, BoardNoteItem, BoardNoteUpdate, ImageItem } from '../types';

// Fallback height for a note that hasn't been resized (auto-height) -
// used only for layout math (framing, stacking new drops below content).
const DEFAULT_NOTE_HEIGHT = 170;

const POLL_INTERVAL_MS = 3000;
const RETRY_INTERVAL_MS = 2000;
const ACTIVE_BOARD_KEY = 'garment-classifier:active-board';

function toBoardImage(placement: BoardImageItem): ImageItem {
  return {
    ...placement.image,
    x: placement.x,
    y: placement.y,
    note: placement.note,
    info_open: placement.info_open,
  };
}

export function useBoards() {
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [boardImages, setBoardImages] = useState<ImageItem[]>([]);
  const [boardNotes, setBoardNotes] = useState<BoardNoteItem[]>([]);
  // The note the user just created - its textarea autofocuses so typing
  // can start immediately (cleared on board switch/refresh).
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  // Floating text/shape elements - own hook so this file stays focused
  // on boards/images/notes; loads alongside placements on every refresh.
  const elements = useBoardElements(activeBoardId, setError);

  const selectBoard = useCallback((id: string) => {
    setActiveBoardId(id);
    localStorage.setItem(ACTIVE_BOARD_KEY, id);
  }, []);

  const refreshPlacements = useCallback(async (boardId: string) => {
    const [placements, notes] = await Promise.all([
      api.listBoardImages(boardId),
      api.listBoardNotes(boardId),
      elements.loadElements(boardId),
    ]);
    setBoardImages(placements.map(toBoardImage));
    setBoardNotes(notes);
    setFocusNoteId(null);
    return placements;
  }, [elements.loadElements]);

  // Initial load: fetch boards, restore the last-open one (or create the
  // first "Untitled Board" so drops work immediately on a fresh install).
  // The Electron window only waits on Vite, so it regularly loads before
  // the API is up - a failed fetch retries quietly instead of leaving
  // the app board-less.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let failedOnce = false;

    const load = async () => {
      try {
        let list = await api.listBoards();
        if (list.length === 0) {
          const created = await api.createBoard('Untitled Board');
          list = [created];
        }
        if (cancelled) return;
        setBoards(list);
        const saved = localStorage.getItem(ACTIVE_BOARD_KEY);
        const initial = list.find((b) => b.id === saved) ?? list[0];
        setActiveBoardId(initial.id);
        await refreshPlacements(initial.id);
        failedOnce = false;
      } catch (err) {
        if (cancelled) return;
        // Surface the first failure, then keep retrying silently so the
        // error toast doesn't re-spawn every couple of seconds.
        if (!failedOnce) {
          failedOnce = true;
          setError((err as Error).message);
        }
        retryTimer = setTimeout(load, RETRY_INTERVAL_MS);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshPlacements]);

  const switchBoard = useCallback(
    (id: string) => {
      if (id === activeBoardId) return;
      selectBoard(id);
      setBoardImages([]);
      setBoardNotes([]);
      elements.clearElements();
      refreshPlacements(id).catch((err: Error) => setError(err.message));
    },
    [activeBoardId, refreshPlacements, selectBoard, elements.clearElements],
  );

  // While any placed image is still being tagged locally, keep polling so
  // cards pick up colors/attributes/embeddings as soon as they're ready.
  useEffect(() => {
    if (!activeBoardId) return;
    const isPending = (img: ImageItem) =>
      img.tagging_status === 'pending' || img.tagging_status === 'processing';
    const hasPending = boardImages.some(
      (img) => isPending(img) || img.details.some(isPending),
    );
    if (!hasPending) return;

    pollTimer.current = setTimeout(() => {
      refreshPlacements(activeBoardId).catch((err: Error) => setError(err.message));
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [boardImages, activeBoardId, refreshPlacements]);

  const createBoard = useCallback(
    async (name = 'Untitled Board') => {
      try {
        const board = await api.createBoard(name);
        setBoards((prev) => [...prev, board]);
        switchBoard(board.id);
        return board;
      } catch (err) {
        setError((err as Error).message);
        return null;
      }
    },
    [switchBoard],
  );

  const renameBoard = useCallback(async (id: string, name: string) => {
    try {
      const updated = await api.renameBoard(id, name);
      setBoards((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const deleteBoard = useCallback(
    async (id: string) => {
      try {
        await api.deleteBoard(id);
        const remaining = boards.filter((b) => b.id !== id);
        setBoards(remaining);
        if (id === activeBoardId) {
          if (remaining.length > 0) {
            switchBoard(remaining[0].id);
          } else {
            // Never leave the app board-less - make a fresh untitled one.
            const board = await api.createBoard('Untitled Board');
            setBoards([board]);
            switchBoard(board.id);
          }
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [boards, activeBoardId, switchBoard],
  );

  // First free spot below the current content, so "add to board" results
  // don't land on top of existing cards.
  const nextFreeY = useCallback(() => {
    const bottoms = [
      ...boardImages.map((img) => img.y + (img.height || 220)),
      ...boardNotes.map(
        (note) => note.y + (note.collapsed ? 40 : note.height ?? DEFAULT_NOTE_HEIGHT),
      ),
      ...elements.boardElements.map((el) => el.y + (el.height || 80)),
    ];
    if (bottoms.length === 0) return 0;
    return Math.max(...bottoms) + 60;
  }, [boardImages, boardNotes, elements.boardElements]);

  const addImagesToBoard = useCallback(
    async (imageIds: string[], x: number, y: number) => {
      if (!activeBoardId || imageIds.length === 0) return;
      try {
        const placed = await api.addImagesToBoard(activeBoardId, imageIds, x, y);
        setBoardImages((prev) => {
          const existing = new Set(prev.map((img) => img.id));
          return [...prev, ...placed.map(toBoardImage).filter((img) => !existing.has(img.id))];
        });
        setBoards((prev) =>
          prev.map((b) =>
            b.id === activeBoardId ? { ...b, image_count: b.image_count + placed.length } : b,
          ),
        );
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [activeBoardId],
  );

  // Files dropped on the canvas upload to the library first, then get a
  // placement on the active board at the drop point.
  const addFilesToBoard = useCallback(
    async (files: File[], x: number, y: number) => {
      for (const [index, file] of files.entries()) {
        try {
          const image = await api.uploadImage(file, x + index * 24, y + index * 24);
          if (activeBoardId) {
            const placed = await api.addImagesToBoard(
              activeBoardId,
              [image.id],
              x + index * 24,
              y + index * 24,
            );
            setBoardImages((prev) => [...prev, ...placed.map(toBoardImage)]);
            setBoards((prev) =>
              prev.map((b) =>
                b.id === activeBoardId ? { ...b, image_count: b.image_count + 1 } : b,
              ),
            );
          }
        } catch (err) {
          setError(`Couldn't add "${file.name}": ${(err as Error).message}`);
        }
      }
    },
    [activeBoardId],
  );

  const moveImage = useCallback(
    (id: string, x: number, y: number) => {
      setBoardImages((prev) => prev.map((img) => (img.id === id ? { ...img, x, y } : img)));
      if (activeBoardId) {
        api.updatePlacementPosition(activeBoardId, id, x, y).catch((err: Error) =>
          setError(err.message),
        );
      }
    },
    [activeBoardId],
  );

  // Removes the placement only - the image stays in the library/search.
  const removeImage = useCallback(
    (id: string) => {
      setBoardImages((prev) => prev.filter((img) => img.id !== id));
      if (activeBoardId) {
        setBoards((prev) =>
          prev.map((b) =>
            b.id === activeBoardId ? { ...b, image_count: Math.max(0, b.image_count - 1) } : b,
          ),
        );
        api.removeImageFromBoard(activeBoardId, id).catch((err: Error) => setError(err.message));
      }
    },
    [activeBoardId],
  );

  // Per-placement extras (note text, info panel open state) - same
  // optimistic pattern as moves: local first, server catches up.
  const updateImageDetails = useCallback(
    (id: string, details: { note?: string; info_open?: boolean }) => {
      setBoardImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, ...details } : img)),
      );
      if (activeBoardId) {
        api.updatePlacementDetails(activeBoardId, id, details).catch((err: Error) =>
          setError(err.message),
        );
      }
    },
    [activeBoardId],
  );

  const addNote = useCallback(
    async (x: number, y: number) => {
      if (!activeBoardId) return;
      try {
        const note = await api.createBoardNote(activeBoardId, x, y);
        setBoardNotes((prev) => [...prev, note]);
        setFocusNoteId(note.id);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [activeBoardId],
  );

  const updateNote = useCallback(
    (id: string, update: BoardNoteUpdate) => {
      setBoardNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...update } : n)));
      if (activeBoardId) {
        api.updateBoardNote(activeBoardId, id, update).catch((err: Error) =>
          setError(err.message),
        );
      }
    },
    [activeBoardId],
  );

  const removeNote = useCallback(
    (id: string) => {
      setBoardNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeBoardId) {
        api.deleteBoardNote(activeBoardId, id).catch((err: Error) => setError(err.message));
      }
    },
    [activeBoardId],
  );

  // Permanently deletes an image from the library (e.g. from the search
  // results pool) - not just its placement on the active board. The
  // backend cascades this to the image's own detail crops and every
  // board placement, so local state has to be reconciled the same way:
  // drop the image itself, drop it from any board's nested detail list
  // it might be a crop of, and drop any of its own details (which the
  // backend just deleted too) that are shown as separate cards.
  const deleteImage = useCallback(
    async (id: string) => {
      try {
        await api.deleteImage(id);
        setBoardImages((prev) =>
          prev
            .filter((img) => img.id !== id && img.parent_id !== id)
            .map((img) =>
              img.details.some((detail) => detail.id === id)
                ? { ...img, details: img.details.filter((detail) => detail.id !== id) }
                : img,
            ),
        );
        // An image can be placed on several boards at once, so its
        // deletion may change image_count on boards other than the
        // active one - refetch rather than guess which ones changed.
        const list = await api.listBoards();
        setBoards(list);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [],
  );

  const retagImage = useCallback((id: string) => {
    setBoardImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, tagging_status: 'pending' } : img)),
    );
    api.retagImage(id).catch((err: Error) => setError(err.message));
  }, []);

  // Swatch files added via the toolbar land in the swatch bank AND get
  // a placement on the active board - same flow as addFilesToBoard but
  // routed through the swatch upload endpoint.
  const addSwatchFilesToBoard = useCallback(
    async (files: File[], x: number, y: number) => {
      for (const [index, file] of files.entries()) {
        try {
          const swatch = await api.uploadSwatch(file);
          if (activeBoardId) {
            const placed = await api.addImagesToBoard(
              activeBoardId,
              [swatch.id],
              x + index * 24,
              y + index * 24,
            );
            setBoardImages((prev) => [...prev, ...placed.map(toBoardImage)]);
            setBoards((prev) =>
              prev.map((b) =>
                b.id === activeBoardId ? { ...b, image_count: b.image_count + 1 } : b,
              ),
            );
          }
        } catch (err) {
          setError(`Couldn't add "${file.name}": ${(err as Error).message}`);
        }
      }
    },
    [activeBoardId],
  );

  // Library-only upload (used from the search panel): the image gets
  // stored and tagged but lands on no board.
  const uploadToLibrary = useCallback(async (file: File) => {
    try {
      return await api.uploadImage(file, 0, 0);
    } catch (err) {
      setError(`Couldn't add "${file.name}": ${(err as Error).message}`);
      return null;
    }
  }, []);

  // Swatch-bank-only upload (search panel, swatch tab) - same deal:
  // banked and tagged, but not placed on a board.
  const uploadSwatchToLibrary = useCallback(async (file: File) => {
    try {
      return await api.uploadSwatch(file);
    } catch (err) {
      setError(`Couldn't add "${file.name}": ${(err as Error).message}`);
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    boards,
    activeBoard,
    activeBoardId,
    boardImages,
    boardNotes,
    boardElements: elements.boardElements,
    focusNoteId,
    focusElementId: elements.focusElementId,
    isLoading,
    error,
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
    nextFreeY,
    addImagesToBoard,
    addFilesToBoard,
    moveImage,
    removeImage,
    deleteImage,
    updateImageDetails,
    addNote,
    updateNote,
    removeNote,
    addElement: elements.addElement,
    updateElement: elements.updateElement,
    removeElement: elements.removeElement,
    retagImage,
    uploadToLibrary,
    uploadSwatchToLibrary,
    addSwatchFilesToBoard,
    clearError,
  };
}
