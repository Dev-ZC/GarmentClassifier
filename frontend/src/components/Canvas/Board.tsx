import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type {
  BoardElementItem,
  BoardElementKind,
  BoardElementUpdate,
  BoardNoteItem,
  BoardNoteUpdate,
  ImageItem,
} from '../../types';
import { CanvasElement } from './CanvasElement';
import { ImageCard } from './ImageCard';
import { NoteCard } from './NoteCard';
import './Board.css';

const HIGHLIGHT_DURATION_MS = 1600;
const FIT_PADDING_PX = 80;
const VIEWPORT_PREFIX = 'garment-classifier:viewport:';
// New-element box sizes, mirrored from the backend defaults so a
// toolbar-added element lands centered in the current view.
const ELEMENT_SIZES: Record<BoardElementKind, { w: number; h: number }> = {
  text: { w: 480, h: 120 },
  rect: { w: 420, h: 280 },
  ellipse: { w: 320, h: 320 },
  arrow: { w: 360, h: 160 },
};
// Custom drag payload used by search results so they can be dropped
// straight onto the canvas.
export const SEARCH_DRAG_TYPE = 'application/x-gc-image-ids';

interface BoardViewport {
  x: number;
  y: number;
  scale: number;
}

interface BoardProps {
  boardId: string;
  images: ImageItem[];
  notes: BoardNoteItem[];
  elements: BoardElementItem[];
  onDropFiles: (files: File[], x: number, y: number) => void;
  onDropImageIds: (imageIds: string[], x: number, y: number) => void;
  onMoveImage: (id: string, x: number, y: number) => void;
  onRemoveImage: (id: string) => void;
  onRetagImage: (id: string) => void;
  onUpdateImageDetails: (id: string, details: { note?: string; info_open?: boolean }) => void;
  onAddNote: (x: number, y: number) => void;
  onMoveNote: (id: string, x: number, y: number) => void;
  onUpdateNote: (id: string, update: BoardNoteUpdate) => void;
  onRemoveNote: (id: string) => void;
  onAddElement: (kind: BoardElementKind, x: number, y: number) => void;
  onUpdateElement: (id: string, update: BoardElementUpdate) => void;
  onRemoveElement: (id: string) => void;
  /** Note whose textarea should autofocus (just created). */
  focusNoteId: string | null;
  /** Element whose text field should autofocus (just created). */
  focusElementId: string | null;
  /** Set when a search result is clicked - pans/zooms to that image. */
  focusImageId: string | null;
  /** Bumped by the toolbar "Center" button to re-frame all content. */
  centerRequest: number;
  /** Bumped by the toolbar "Add note" button - drops a note in view. */
  noteRequest: number;
  /** Bumped by the toolbar element buttons - drops a shape/text in view. */
  elementRequest: { kind: BoardElementKind; n: number };
}

export function Board({
  boardId,
  images,
  notes,
  elements,
  onDropFiles,
  onDropImageIds,
  onMoveImage,
  onRemoveImage,
  onRetagImage,
  onUpdateImageDetails,
  onAddNote,
  onMoveNote,
  onUpdateNote,
  onRemoveNote,
  onAddElement,
  onUpdateElement,
  onRemoveElement,
  focusNoteId,
  focusElementId,
  focusImageId,
  centerRequest,
  noteRequest,
  elementRequest,
}: BoardProps) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitialFit = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Each board remounts (keyed by boardId), so this initializer runs once
  // per board open and restores where the user left off.
  const [initialView] = useState<BoardViewport | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(VIEWPORT_PREFIX + boardId) ?? 'null');
    } catch {
      return null;
    }
  });
  // Kept in a ref rather than state: ImageCards only read it while
  // dragging, so zooming shouldn't re-render every card each frame.
  const scaleRef = useRef(initialView?.scale ?? 1);

  const fitToContent = useCallback(() => {
    const transform = transformRef.current;
    const container = containerRef.current;
    if (!transform || !container) return;
    const rect = container.getBoundingClientRect();

    // Everything on the surface - images at their stored size, notes at
    // their fixed width with a rough height - counts for the frame.
    const bounds = [
      ...images.map((img) => ({
        x: img.x,
        y: img.y,
        w: img.width || 220,
        h: img.height || 220,
      })),
      ...notes.map((note) => ({
        x: note.x,
        y: note.y,
        w: note.collapsed ? 200 : note.width || 240,
        h: note.collapsed ? 40 : note.height ?? 170,
      })),
      ...elements.map((el) => ({
        x: el.x,
        y: el.y,
        w: el.width || 200,
        h: el.height || 80,
      })),
    ];
    if (bounds.length === 0) {
      transform.setTransform(0, 0, 1, 400, 'easeOut');
      return;
    }

    const minX = Math.min(...bounds.map((b) => b.x));
    const minY = Math.min(...bounds.map((b) => b.y));
    const maxX = Math.max(...bounds.map((b) => b.x + b.w));
    const maxY = Math.max(...bounds.map((b) => b.y + b.h));
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const fitted = Math.min(
      (rect.width - FIT_PADDING_PX * 2) / contentW,
      (rect.height - FIT_PADDING_PX * 2) / contentH,
    );
    const nextScale = Math.max(0.1, Math.min(fitted, 2));
    const centerX = minX + contentW / 2;
    const centerY = minY + contentH / 2;
    transform.setTransform(
      rect.width / 2 - centerX * nextScale,
      rect.height / 2 - centerY * nextScale,
      nextScale,
      450,
      'easeOut',
    );
  }, [images, notes, elements]);

  // First open of a board with no saved view: frame whatever's on it.
  useEffect(() => {
    if (
      didInitialFit.current ||
      initialView ||
      (images.length === 0 && notes.length === 0 && elements.length === 0)
    )
      return;
    didInitialFit.current = true;
    requestAnimationFrame(fitToContent);
  }, [images, notes, elements, initialView, fitToContent]);

  // Compared against the last-handled value (not just "> 0") because
  // fitToContent's identity changes whenever images/notes change - e.g.
  // dragging a card, opening a cluster, or the tagging poll updating a
  // card - which would otherwise re-run this effect and recenter the
  // view on every such change instead of only on an actual button press.
  const seenCenterRequest = useRef(centerRequest);
  useEffect(() => {
    if (centerRequest === seenCenterRequest.current) return;
    seenCenterRequest.current = centerRequest;
    fitToContent();
  }, [centerRequest, fitToContent]);

  // The toolbar "Add note" button drops a fresh note in the middle of
  // whatever the user is currently looking at. The counter is compared
  // against its mount-time value - Board remounts on every board switch,
  // and without the guard a stale request would spawn a note on each
  // newly opened board.
  const seenNoteRequest = useRef(noteRequest);
  useEffect(() => {
    if (noteRequest === seenNoteRequest.current) return;
    seenNoteRequest.current = noteRequest;
    const transform = transformRef.current;
    const container = containerRef.current;
    if (!transform || !container) return;
    const rect = container.getBoundingClientRect();
    const { x, y } = transform.clientToContent(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    // Offset by half the note size so it lands centered in the view.
    onAddNote(x - 120, y - 85);
  }, [noteRequest, onAddNote]);

  // Toolbar element buttons drop a text label/shape in the middle of the
  // current view - same mount-time guard as noteRequest so reopening a
  // board doesn't spawn elements.
  const seenElementRequest = useRef(elementRequest.n);
  useEffect(() => {
    if (elementRequest.n === seenElementRequest.current) return;
    seenElementRequest.current = elementRequest.n;
    const transform = transformRef.current;
    const container = containerRef.current;
    if (!transform || !container) return;
    const rect = container.getBoundingClientRect();
    const { x, y } = transform.clientToContent(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const size = ELEMENT_SIZES[elementRequest.kind];
    // Offset by half the element size so it lands centered in the view.
    onAddElement(elementRequest.kind, x - size.w / 2, y - size.h / 2);
  }, [elementRequest, onAddElement]);

  // Double-click on bare canvas creates a note at the cursor - the same
  // convention as Miro/FigJam/tldraw stickies. Single clicks don't
  // create anything; presses that began on a card/note/panel don't count.
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        (e.target as HTMLElement).closest(
          '.image-card-wrap, .note-card, .image-card-panel, .canvas-el',
        )
      )
        return;
      if (!transformRef.current) return;
      const { x, y } = transformRef.current.clientToContent(e.clientX, e.clientY);
      // Center the note horizontally on the click point.
      onAddNote(x - 120, y);
    },
    [onAddNote],
  );

  useEffect(() => {
    if (!focusImageId || !transformRef.current) return;
    transformRef.current.zoomToElement(`image-${focusImageId}`, { scale: 1, animationTime: 450 });
    setHighlightedId(focusImageId);
    const timer = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [focusImageId]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!transformRef.current) return;
      const { x, y } = transformRef.current.clientToContent(e.clientX, e.clientY);

      // Library images dragged in from the search results panel.
      const draggedIds = e.dataTransfer.getData(SEARCH_DRAG_TYPE);
      if (draggedIds) {
        try {
          onDropImageIds(JSON.parse(draggedIds) as string[], x, y);
        } catch {
          // Malformed payload - ignore the drop.
        }
        return;
      }

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (files.length === 0) return;
      onDropFiles(files, x, y);
    },
    [onDropFiles, onDropImageIds],
  );

  return (
    <div
      ref={containerRef}
      className={`board ${isDragOver ? 'board--drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={initialView?.scale ?? 1}
        initialPositionX={initialView?.x ?? 0}
        initialPositionY={initialView?.y ?? 0}
        minScale={0.1}
        maxScale={4}
        limitToBounds={false}
        // Dragging a card should move only that card, not pan the board.
        // Info panels and notes are excluded too so interacting with
        // their text doesn't move the canvas.
        panning={{
          velocityDisabled: true,
          excluded: [
            'image-card',
            'image-card-aside',
            'image-card-panel',
            'image-card-note',
            'note-card',
            'canvas-el',
          ],
        }}
        // Plain scroll/two-finger trackpad pans the board; hold Ctrl and scroll (or pinch) to zoom.
        // Not excluding cards/panels/notes here - they handle their own scroll-chaining
        // (see stopWheelIfScrollable) by consuming the wheel event only while they can
        // still scroll, and otherwise letting it bubble up to keep panning the board. A
        // blanket class exclusion would kill panning the instant the cursor crosses one,
        // even when there's nothing to scroll.
        // Lower-than-default step keeps zoom fine-grained and smooth instead of jumpy.
        wheel={{ wheelDisabled: true, step: 0.006 }}
        pinch={{ step: 3 }}
        trackPadPanning={{ disabled: false }}
        doubleClick={{ disabled: true }}
        onTransform={(_ref, state) => {
          scaleRef.current = state.scale;
          // Debounced so panning doesn't hammer localStorage every frame.
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            localStorage.setItem(
              VIEWPORT_PREFIX + boardId,
              JSON.stringify({ x: state.positionX, y: state.positionY, scale: state.scale }),
            );
          }, 300);
        }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%' }}
        >
          <div className="board__surface">
            {images.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                scaleRef={scaleRef}
                onMove={onMoveImage}
                onRemove={onRemoveImage}
                onRetag={onRetagImage}
                onUpdateDetails={onUpdateImageDetails}
                isHighlighted={highlightedId === image.id}
              />
            ))}
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                scaleRef={scaleRef}
                autoFocus={note.id === focusNoteId}
                onMove={onMoveNote}
                onUpdate={onUpdateNote}
                onRemove={onRemoveNote}
              />
            ))}
            {elements.map((element) => (
              <CanvasElement
                key={element.id}
                element={element}
                scaleRef={scaleRef}
                autoFocus={element.id === focusElementId}
                onUpdate={onUpdateElement}
                onRemove={onRemoveElement}
              />
            ))}
          </div>
        </TransformComponent>
      </TransformWrapper>
      {images.length === 0 && notes.length === 0 && elements.length === 0 && (
        <div className="board__empty-hint">
          Drop images here or drag them in from search - double-click for a note, or use the
          toolbar to add text and shapes
        </div>
      )}
    </div>
  );
}
