import { useCallback, useRef, useState } from 'react';
import { useDebouncedSave } from '../../hooks/useDebouncedSave';
import type { BoardElementItem, BoardElementUpdate } from '../../types';
import { stopWheelIfScrollable } from '../../utils/scrollChain';
import { IconFlipHorizontal, IconFlipVertical, IconX } from '../icons';
import './CanvasElement.css';

// Accent palette keys (persisted on the element) - same set as notes so
// both feel like one system; colors live in CanvasElement.css.
const ELEMENT_COLORS = ['surface', 'yellow', 'blue', 'pink', 'green', 'purple'] as const;

// Smallest box each kind can shrink to while resizing.
const MIN_SIZES: Record<BoardElementItem['kind'], { w: number; h: number }> = {
  text: { w: 140, h: 44 },
  rect: { w: 28, h: 28 },
  ellipse: { w: 28, h: 28 },
  arrow: { w: 48, h: 24 },
};

// Text label font-size stepper bounds.
const FONT_SIZE_STEP = 4;
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 120;

// Padding inside an arrow's box so the head/stroke never clip the edge.
const ARROW_PAD = 9;

interface CanvasElementProps {
  element: BoardElementItem;
  scaleRef: React.RefObject<number>;
  autoFocus: boolean;
  onUpdate: (id: string, update: BoardElementUpdate) => void;
  onRemove: (id: string) => void;
}

// Diagonal arrow inside the bounding box, tail to head. The head sits
// at the bottom-right corner by default; flip_x/flip_y mirror it onto
// the other corners, so any direction is reachable without rotation.
function ArrowShape({
  width,
  height,
  flipX,
  flipY,
}: {
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
}) {
  const x0 = ARROW_PAD;
  const y0 = ARROW_PAD;
  const x1 = Math.max(width - ARROW_PAD, ARROW_PAD + 1);
  const y1 = Math.max(height - ARROW_PAD, ARROW_PAD + 1);
  const tailX = flipX ? x1 : x0;
  const tailY = flipY ? y1 : y0;
  const headX = flipX ? x0 : x1;
  const headY = flipY ? y0 : y1;

  const dx = headX - tailX;
  const dy = headY - tailY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const headLen = Math.min(26, len * 0.4);
  const spread = headLen * 0.5;
  const baseX = headX - ux * headLen;
  const baseY = headY - uy * headLen;
  // Stroke weight tracks the box so a big arrow doesn't look stringy
  // next to full-size image cards.
  const stroke = Math.min(6, Math.max(2.5, Math.min(width, height) * 0.05));

  return (
    <svg
      className="canvas-el__arrow"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ '--arrow-stroke': stroke } as React.CSSProperties}
    >
      <line x1={tailX} y1={tailY} x2={headX} y2={headY} />
      <line x1={headX} y1={headY} x2={baseX + nx * spread} y2={baseY + ny * spread} />
      <line x1={headX} y1={headY} x2={baseX - nx * spread} y2={baseY - ny * spread} />
    </svg>
  );
}

// A floating element on the board - text label, rectangle, ellipse, or
// arrow. Drags by its body, resizes from the bottom-right corner, and
// shows a small toolbar on hover (palette, arrow flips, delete) rather
// than a permanent header like a note card.
export function CanvasElement({
  element,
  scaleRef,
  autoFocus,
  onUpdate,
  onRemove,
}: CanvasElementProps) {
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  const resizeState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(
    null,
  );
  const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null);

  const saveText = useCallback(
    (text: string) => onUpdate(element.id, { text }),
    [element.id, onUpdate],
  );
  const [draftText, setDraftText] = useDebouncedSave(element.text, saveText);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // The textarea, toolbar buttons, and resize handle stay
      // interactive; grabbing anywhere else on the box moves it.
      if ((e.target as HTMLElement).closest('textarea, button, input, .canvas-el__resize')) return;
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: element.x,
        originY: element.y,
      };
    },
    [element.x, element.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const { startX, startY, originX, originY } = dragState.current;
      const zoom = scaleRef.current ?? 1;
      onUpdate(element.id, {
        x: originX + (e.clientX - startX) / zoom,
        y: originY + (e.clientY - startY) / zoom,
      });
    },
    [element.id, onUpdate, scaleRef],
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
        startW: element.width,
        startH: element.height,
      };
    },
    [element.width, element.height],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeState.current) return;
      const { startX, startY, startW, startH } = resizeState.current;
      const min = MIN_SIZES[element.kind];
      const zoom = scaleRef.current ?? 1;
      setLiveSize({
        width: Math.max(min.w, startW + (e.clientX - startX) / zoom),
        height: Math.max(min.h, startH + (e.clientY - startY) / zoom),
      });
    },
    [element.kind, scaleRef],
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      resizeState.current = null;
      setLiveSize((size) => {
        if (size) onUpdate(element.id, { width: size.width, height: size.height });
        return null;
      });
    },
    [element.id, onUpdate],
  );

  // An empty text label that loses focus has no reason to stay on the
  // board - same convention as Miro/FigJam text.
  const handleTextBlur = useCallback(() => {
    if (!draftText.trim()) onRemove(element.id);
  }, [draftText, element.id, onRemove]);

  const nudgeFontSize = useCallback(
    (direction: 1 | -1) => {
      const next = element.font_size + direction * FONT_SIZE_STEP;
      onUpdate(element.id, {
        font_size: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next)),
      });
    },
    [element.id, element.font_size, onUpdate],
  );

  const color = ELEMENT_COLORS.includes(element.color as (typeof ELEMENT_COLORS)[number])
    ? element.color
    : 'surface';

  const width = liveSize?.width ?? element.width;
  const height = liveSize?.height ?? element.height;

  return (
    <div
      className={`canvas-el canvas-el--${element.kind}`}
      data-color={color}
      style={{ left: element.x, top: element.y, width, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {element.kind === 'text' && (
        <textarea
          className="canvas-el__textarea"
          style={{ fontSize: element.font_size }}
          value={draftText}
          placeholder="Type something"
          autoFocus={autoFocus}
          spellCheck={false}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={handleTextBlur}
          onWheel={stopWheelIfScrollable}
        />
      )}
      {element.kind === 'rect' && <div className="canvas-el__shape canvas-el__shape--rect" />}
      {element.kind === 'ellipse' && (
        <div className="canvas-el__shape canvas-el__shape--ellipse" />
      )}
      {element.kind === 'arrow' && (
        <ArrowShape
          width={width}
          height={height}
          flipX={element.flip_x}
          flipY={element.flip_y}
        />
      )}

      <div className="canvas-el__tools">
        {ELEMENT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`canvas-el__dot canvas-el__dot--${c} ${c === color ? 'canvas-el__dot--active' : ''}`}
            title={`${c} ${element.kind}`}
            onClick={() => onUpdate(element.id, { color: c })}
          />
        ))}
        {element.kind === 'text' && (
          <>
            <span className="canvas-el__tools-divider" />
            <button
              type="button"
              className="canvas-el__icon-btn canvas-el__font-btn"
              title="Decrease text size"
              onClick={() => nudgeFontSize(-1)}
            >
              A−
            </button>
            <button
              type="button"
              className="canvas-el__icon-btn canvas-el__font-btn"
              title="Increase text size"
              onClick={() => nudgeFontSize(1)}
            >
              A+
            </button>
          </>
        )}
        {element.kind === 'arrow' && (
          <>
            <span className="canvas-el__tools-divider" />
            <button
              type="button"
              className="canvas-el__icon-btn"
              title="Flip horizontally"
              onClick={() => onUpdate(element.id, { flip_x: !element.flip_x })}
            >
              <IconFlipHorizontal size={16} />
            </button>
            <button
              type="button"
              className="canvas-el__icon-btn"
              title="Flip vertically"
              onClick={() => onUpdate(element.id, { flip_y: !element.flip_y })}
            >
              <IconFlipVertical size={16} />
            </button>
          </>
        )}
        <span className="canvas-el__tools-divider" />
        <button
          type="button"
          className="canvas-el__icon-btn canvas-el__icon-btn--danger"
          title="Delete element"
          onClick={() => onRemove(element.id)}
        >
          <IconX size={16} />
        </button>
      </div>

      <div
        className="canvas-el__resize"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />
    </div>
  );
}
