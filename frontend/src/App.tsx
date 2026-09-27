import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import './App.css';
import { BoardsMenu } from './components/Boards/BoardsMenu';
import { Board } from './components/Canvas/Board';
import {
  IconArrowRight,
  IconCenter,
  IconCircle,
  IconPlus,
  IconShapes,
  IconSquare,
  IconStickyNote,
  IconSwatch,
  IconText,
} from './components/icons';
import { SearchOverlay } from './components/Search/SearchOverlay';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { useBoards } from './hooks/useBoards';
import { useTheme } from './hooks/useTheme';
import type { BoardElementKind } from './types';

// One toolbar button fans out to these - keeps the top-right cluster
// compact instead of a row of four shape buttons.
const ELEMENT_MENU_ITEMS: {
  kind: BoardElementKind;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}[] = [
  { kind: 'text', label: 'Text', Icon: IconText },
  { kind: 'rect', label: 'Rectangle', Icon: IconSquare },
  { kind: 'ellipse', label: 'Ellipse', Icon: IconCircle },
  { kind: 'arrow', label: 'Arrow', Icon: IconArrowRight },
];

function App() {
  const {
    boards,
    activeBoard,
    activeBoardId,
    boardImages,
    boardNotes,
    boardElements,
    focusNoteId,
    focusElementId,
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
    addElement,
    updateElement,
    removeElement,
    retagImage,
    uploadToLibrary,
    uploadSwatchToLibrary,
    addSwatchFilesToBoard,
    clearError,
  } = useBoards();
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const swatchInputRef = useRef<HTMLInputElement>(null);
  const [focusImageId, setFocusImageId] = useState<string | null>(null);
  const [centerRequest, setCenterRequest] = useState(0);
  const [noteRequest, setNoteRequest] = useState(0);
  // Toolbar element buttons bump the counter; the kind says what drops.
  const [elementRequest, setElementRequest] = useState<{
    kind: BoardElementKind;
    n: number;
  }>({ kind: 'rect', n: 0 });
  const [elementMenuOpen, setElementMenuOpen] = useState(false);
  const elementMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  // Close the element picker on outside click or Escape while it's open.
  useEffect(() => {
    if (!elementMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!elementMenuRef.current?.contains(e.target as Node)) setElementMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setElementMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [elementMenuOpen]);

  const handleDropFiles = useCallback(
    (files: File[], x: number, y: number) => {
      void addFilesToBoard(files, x, y);
    },
    [addFilesToBoard],
  );

  const handleFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      handleDropFiles(files, 0, 0);
      e.target.value = '';
    },
    [handleDropFiles],
  );

  const handleSwatchPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      void addSwatchFilesToBoard(files, 0, 0);
      e.target.value = '';
    },
    [addSwatchFilesToBoard],
  );

  // Selecting a search result jumps the canvas to it; re-set to null first
  // so re-selecting the same (already-focused) image still re-triggers it.
  const handleSelectResult = useCallback((imageId: string) => {
    setFocusImageId(null);
    requestAnimationFrame(() => setFocusImageId(imageId));
  }, []);

  // Deleting an image from the search pool can target whatever's
  // currently focused/panned-to on the board - clear that first so the
  // canvas doesn't try to zoom to a card that no longer exists.
  const handleDeleteImage = useCallback(
    (imageId: string) => {
      setFocusImageId((current) => (current === imageId ? null : current));
      return deleteImage(imageId);
    },
    [deleteImage],
  );

  const handleAddToBoard = useCallback(
    (imageIds: string[], x?: number, y?: number) => {
      void addImagesToBoard(imageIds, x ?? 0, y ?? nextFreeY());
    },
    [addImagesToBoard, nextFreeY],
  );

  const handleAddNote = useCallback((x: number, y: number) => {
    void addNote(x, y);
  }, [addNote]);

  const handleMoveNote = useCallback(
    (id: string, x: number, y: number) => updateNote(id, { x, y }),
    [updateNote],
  );

  const requestElement = useCallback((kind: BoardElementKind) => {
    setElementRequest((req) => ({ kind, n: req.n + 1 }));
  }, []);

  const handleAddElement = useCallback(
    (kind: BoardElementKind, x: number, y: number) => {
      void addElement(kind, x, y);
    },
    [addElement],
  );

  return (
    <div className="app">
      <SearchOverlay
        activeBoardId={activeBoardId}
        onSelectResult={handleSelectResult}
        onAddToBoard={(ids) => handleAddToBoard(ids)}
        onUploadToLibrary={uploadToLibrary}
        onUploadSwatch={uploadSwatchToLibrary}
        onDeleteImage={handleDeleteImage}
      />

      <div className="app__boards">
        <BoardsMenu
          boards={boards}
          activeBoardId={activeBoardId}
          onSelect={switchBoard}
          onCreate={() => void createBoard()}
          onRename={renameBoard}
          onDelete={deleteBoard}
        />
      </div>

      <div className="toolbar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFilePicked}
        />
        <button
          type="button"
          className="toolbar__icon-btn toolbar__icon-btn--primary"
          data-tip="Add images to board"
          aria-label="Add images to board"
          onClick={() => fileInputRef.current?.click()}
        >
          <IconPlus size={17} />
        </button>
        <input
          ref={swatchInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleSwatchPicked}
        />
        <button
          type="button"
          className="toolbar__icon-btn"
          data-tip="Add fabric swatch"
          aria-label="Add fabric swatch to bank and board"
          onClick={() => swatchInputRef.current?.click()}
        >
          <IconSwatch size={17} />
        </button>
        <button
          type="button"
          className="toolbar__icon-btn"
          data-tip="Add note"
          aria-label="Add note to board"
          onClick={() => setNoteRequest((n) => n + 1)}
        >
          <IconStickyNote size={17} />
        </button>
        <div className="toolbar__menu-wrap" ref={elementMenuRef}>
          <button
            type="button"
            className={`toolbar__icon-btn ${elementMenuOpen ? 'toolbar__icon-btn--open' : ''}`}
            data-tip={elementMenuOpen ? undefined : 'Add text or shape'}
            aria-label="Add text or shape to board"
            aria-expanded={elementMenuOpen}
            onClick={() => setElementMenuOpen((open) => !open)}
          >
            <IconShapes size={17} />
          </button>
          {elementMenuOpen && (
            <div className="toolbar__menu" role="menu">
              {ELEMENT_MENU_ITEMS.map(({ kind, label, Icon }) => (
                <button
                  key={kind}
                  type="button"
                  className="toolbar__menu-item"
                  role="menuitem"
                  onClick={() => {
                    requestElement(kind);
                    setElementMenuOpen(false);
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="toolbar__icon-btn"
          data-tip="Center view"
          aria-label="Center view over all images"
          onClick={() => setCenterRequest((n) => n + 1)}
        >
          <IconCenter size={17} />
        </button>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <Board
        key={activeBoard?.id ?? 'none'}
        boardId={activeBoard?.id ?? 'none'}
        images={boardImages}
        notes={boardNotes}
        elements={boardElements}
        onDropFiles={handleDropFiles}
        onDropImageIds={handleAddToBoard}
        onMoveImage={moveImage}
        onRemoveImage={removeImage}
        onRetagImage={retagImage}
        onUpdateImageDetails={updateImageDetails}
        onAddNote={handleAddNote}
        onMoveNote={handleMoveNote}
        onUpdateNote={updateNote}
        onRemoveNote={removeNote}
        onAddElement={handleAddElement}
        onUpdateElement={updateElement}
        onRemoveElement={removeElement}
        focusNoteId={focusNoteId}
        focusElementId={focusElementId}
        focusImageId={focusImageId}
        centerRequest={centerRequest}
        noteRequest={noteRequest}
        elementRequest={elementRequest}
      />

      {error && (
        <div className="app__error" onClick={clearError} title="Click to dismiss">
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
