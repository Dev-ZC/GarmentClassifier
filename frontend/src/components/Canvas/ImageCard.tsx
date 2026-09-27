import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveImageUrl } from '../../api/client';
import type { ImageItem } from '../../types';
import { GarmentTypeIcon, IconSwatch, IconX } from '../icons';
import { ImageNoteCard } from './ImageNoteCard';
import { ImageInfoPanel, SwatchInfoPanel, type ImageDetails } from './ImagePanels';
import './ImageCard.css';
import './ImageCluster.css';
import './ImageClusterMotion.css';

interface ImageCardProps {
  image: ImageItem;
  scaleRef: React.RefObject<number>;
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onRetag: (id: string) => void;
  onUpdateDetails: (id: string, details: ImageDetails) => void;
  isHighlighted: boolean;
}

const CLICK_SLOP_PX = 6;

// Furthest a detail mini may sit from the card edge it's anchored to,
// as a fraction of the card's size. Beyond this a mini reads as a
// random float rather than part of the cluster.
const DETAIL_MAX_GAP = 0.1;

// Deterministic per-image cluster arrangement, so different images fan
// their details out in different-looking constellations.
function clusterVariant(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 3;
}

// Where each detail crop lands around the card, keyed by how many crops
// there are. x/y/w are fractions of the card's own size so minis stay
// proportional to the image they came from: negative x sits left of the
// card, y > 1 sits below it, and negative y anchors above it. Widths
// near (and sometimes past) the card's own width keep the crops big
// enough to be useful; sizes vary per slot for a bento feel.
interface DetailSlot {
  x: number;
  y: number;
  w: number;
}

// v0 (aside on the right): crops wrap the left and bottom edges.
const DETAIL_SLOTS_V0: Record<number, DetailSlot[]> = {
  1: [{ x: -0.82, y: 0.08, w: 0.74 }],
  2: [
    { x: -0.78, y: -0.1, w: 0.66 },
    { x: 0.1, y: 1.12, w: 0.62 },
  ],
  3: [
    { x: -0.76, y: -0.12, w: 0.62 },
    { x: -0.92, y: 0.56, w: 0.54 },
    { x: 0.08, y: 1.12, w: 0.6 },
  ],
  4: [
    { x: -0.74, y: -0.14, w: 0.6 },
    { x: -0.96, y: 0.48, w: 0.5 },
    { x: -0.02, y: 1.12, w: 0.54 },
    { x: 0.58, y: 1.06, w: 0.46 },
  ],
  5: [
    { x: -0.72, y: -0.16, w: 0.58 },
    { x: -1.0, y: 0.42, w: 0.48 },
    { x: -0.04, y: 1.12, w: 0.5 },
    { x: 0.54, y: 1.08, w: 0.44 },
    { x: -0.56, y: 0.58, w: 0.38 },
  ],
};

// v2: crops sandwich the card - a staggered row above and one below.
const DETAIL_SLOTS_V2: Record<number, DetailSlot[]> = {
  1: [{ x: 0.22, y: 1.16, w: 0.64 }],
  2: [
    { x: -0.1, y: -0.05, w: 0.58 },
    { x: 0.44, y: 1.1, w: 0.62 },
  ],
  3: [
    { x: -0.08, y: -0.05, w: 0.52 },
    { x: 0.52, y: -0.04, w: 0.46 },
    { x: 0.2, y: 1.12, w: 0.6 },
  ],
  4: [
    { x: -0.12, y: -0.05, w: 0.5 },
    { x: 0.46, y: -0.04, w: 0.44 },
    { x: -0.04, y: 1.12, w: 0.48 },
    { x: 0.52, y: 1.1, w: 0.52 },
  ],
  5: [
    { x: -0.2, y: -0.04, w: 0.42 },
    { x: 0.28, y: -0.04, w: 0.36 },
    { x: 0.7, y: -0.04, w: 0.3 },
    { x: -0.06, y: 1.1, w: 0.48 },
    { x: 0.5, y: 1.12, w: 0.5 },
  ],
};

const DETAIL_LAYOUTS: Record<number, Record<number, DetailSlot[]>> = {
  0: DETAIL_SLOTS_V0,
  2: DETAIL_SLOTS_V2,
};

function detailSlots(variant: number, count: number): DetailSlot[] {
  const table = DETAIL_LAYOUTS[variant] ?? DETAIL_SLOTS_V0;
  const slots = table[Math.min(Math.max(count, 1), 5)] ?? [];
  // v1 mirrors v0 horizontally - the aside sits left, so crops wrap the
  // right and bottom edges instead.
  if (variant !== 1) return slots;
  return slots.map((slot) => ({ ...slot, x: 1 - slot.x - slot.w }));
}

// A detail crop placed on its cluster slot. --i staggers the slide-in,
// --ox/--oy offset the start point toward the card edge it's nearest to,
// and --rot gives each mini a slight alternating tilt for bento feel.
function DetailMini({
  detail,
  index,
  slot,
}: {
  detail: ImageItem;
  index: number;
  slot: DetailSlot;
}) {
  // Size follows the crop's own shape - landscape crops get wider, tall
  // ones narrower - so every cluster's mix reads differently.
  const ratio = detail.width > 0 && detail.height > 0 ? detail.width / detail.height : 1;
  const factor = ratio >= 1.35 ? 1.18 : ratio <= 0.72 ? 0.8 : 1;
  const width = Math.min(slot.w * factor, 0.9);
  // Slots are authored assuming a full-size mini; a small crop on a far
  // corner slot floats away from the card and reads detached. Cap the
  // gap so it tucks in beside the edge - same quadrant, still bento,
  // just attached.
  let x = slot.x;
  if (x + width < -DETAIL_MAX_GAP) x = -width - DETAIL_MAX_GAP;
  else if (x > 1 + DETAIL_MAX_GAP) x = 1 + DETAIL_MAX_GAP;
  let y = slot.y;
  if (y < -DETAIL_MAX_GAP) y = -DETAIL_MAX_GAP;
  else if (y > 1 + DETAIL_MAX_GAP) y = 1 + DETAIL_MAX_GAP;
  const ox = x < -0.02 ? 30 : x + width > 1.02 ? -30 : 0;
  const oy = y < 0 ? 30 : y > 1 ? -30 : 0;
  const position: Pick<React.CSSProperties, 'top' | 'bottom'> =
    y < 0
      ? { bottom: `calc(100% + ${-y * 100}%)` }
      : { top: `${y * 100}%` };

  return (
    <figure
      className="image-card-detail"
      style={
        {
          left: `${x * 100}%`,
          width: `${width * 100}%`,
          '--i': index,
          '--ox': `${ox}px`,
          '--oy': `${oy}px`,
          '--rot': `${index % 2 === 0 ? -0.8 : 0.8}deg`,
          ...position,
        } as React.CSSProperties & Record<string, string | number>
      }
      title={detail.description ?? detail.original_filename}
    >
      <img
        src={resolveImageUrl(detail)}
        alt={detail.original_filename}
        draggable={false}
      />
      <figcaption>{detail.style_tags[0] ?? detail.description ?? 'detail'}</figcaption>
    </figure>
  );
}

export function ImageCard({ image, scaleRef, onMove, onRemove, onRetag, onUpdateDetails, isHighlighted }: ImageCardProps) {
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  const clickOrigin = useRef<{ x: number; y: number } | null>(null);
  const infoOpen = image.info_open ?? false;
  const variant = useMemo(() => clusterVariant(image.id), [image.id]);
  // When the cluster closes it stays mounted a beat longer so the
  // slide-back-in animation can play before the items disappear.
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(infoOpen);

  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = infoOpen;
    if (was && !infoOpen) {
      setClosing(true);
      const timer = setTimeout(() => setClosing(false), 620);
      return () => clearTimeout(timer);
    }
  }, [infoOpen]);

  const clusterVisible = infoOpen || closing;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      clickOrigin.current = { x: e.clientX, y: e.clientY };
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: image.x,
        originY: image.y,
      };
    },
    [image.x, image.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const { startX, startY, originX, originY } = dragState.current;
      // Divide by scale so the card tracks the cursor 1:1 regardless of zoom.
      const zoom = scaleRef.current ?? 1;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      onMove(image.id, originX + dx, originY + dy);
    },
    [image.id, onMove, scaleRef],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragState.current = null;
  }, []);

  // A click (not a drag) toggles the detail cluster. Drags are rejected
  // by the slop distance, so moving a card never opens its cluster.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const origin = clickOrigin.current;
      clickOrigin.current = null;
      if (!origin) return;
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < CLICK_SLOP_PX) {
        onUpdateDetails(image.id, { info_open: !infoOpen });
      }
    },
    [image.id, infoOpen, onUpdateDetails],
  );

  // An outfit photo contributes one garment_type/fabric/fit per piece;
  // swatches/patterns/other photos instead carry the top-level fields.
  const garmentTags = image.garments.flatMap((g) => [g.garment_type, g.fabric, g.fit_shape]);
  const attributeTags = [...garmentTags, image.pattern, image.fabric].filter(
    (v): v is string => Boolean(v),
  );
  const allTags = [...new Set([...attributeTags, ...image.style_tags, ...image.tags])];

  // Fabric crops extracted into the swatch bank render inside the info
  // panel instead of as bento minis - only non-swatch details fan out.
  const detailMinis = image.details.filter((detail) => !detail.is_swatch);

  // Each detail crop lands on a slot sized and positioned per crop
  // count - the layout differs per cluster variant and per how many
  // crops the VLM found.
  const slots = detailSlots(variant, detailMinis.length);

  return (
    <div
      id={`image-${image.id}`}
      className={`image-card-wrap cluster-v${variant}${closing && !infoOpen ? ' cluster--closing' : ''}`}
      style={{
        left: image.x,
        top: image.y,
        width: image.width || 220,
        zIndex: clusterVisible ? 20 : undefined,
      }}
    >
      <div
        className={`image-card ${isHighlighted ? 'image-card--highlighted' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      >
        <button
          className="image-card__remove"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(image.id);
          }}
          title="Remove image"
        >
          <IconX size={12} />
        </button>
        <img src={resolveImageUrl(image)} alt={image.original_filename} draggable={false} />

        {(image.tagging_status === 'pending' || image.tagging_status === 'processing') && (
          <div className="image-card__status image-card__status--busy">
            <span className="image-card__spinner" /> Tagging...
          </div>
        )}
        {image.tagging_status === 'failed' && (
          <button
            className="image-card__status image-card__status--failed"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRetag(image.id);
            }}
            title={image.tagging_error ?? 'Tagging failed'}
          >
            Tagging failed - retry
          </button>
        )}

        {/* Compact preview (swatch strip + tag pills) - replaced by the
            detail cluster while it is open. */}
        {!infoOpen && image.dominant_colors.length > 0 && (
          <div className="image-card__swatches">
            {image.dominant_colors.map((color) => (
              <span
                key={color.hex}
                className="image-card__swatch"
                style={{ background: color.hex, flexGrow: color.percent }}
                title={color.hex}
              />
            ))}
          </div>
        )}

        {/* Swatch cards get a compact fabric strip instead of the
            generic tag pills: material name + the garment icons it
            suits, so a closed card already reads as a swatch. */}
        {!infoOpen && image.is_swatch && (
          <div className="image-card__fabric">
            <IconSwatch size={13} />
            <span className="image-card__fabric-name">
              {image.fabric ?? image.original_filename}
            </span>
            <span className="image-card__fabric-uses">
              {image.suitable_for.slice(0, 4).map((use) => (
                <GarmentTypeIcon key={use} name={use} size={13} />
              ))}
            </span>
          </div>
        )}

        {!infoOpen && !image.is_swatch && allTags.length > 0 && (
          <div className="image-card__tags">
            {allTags.map((tag) => (
              <span key={tag} className="image-card__tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* The cluster: an aside (info panel + sticky note stacked) plus
          detail-crop minis wrapping the card's other sides. */}
      {clusterVisible && (
        <div className="image-card-aside">
          {image.is_swatch ? (
            <SwatchInfoPanel image={image} onUpdateDetails={onUpdateDetails} />
          ) : (
            <ImageInfoPanel image={image} allTags={allTags} onUpdateDetails={onUpdateDetails} />
          )}
          <ImageNoteCard image={image} onUpdateDetails={onUpdateDetails} />
        </div>
      )}

      {clusterVisible &&
        detailMinis.map((detail, index) => {
          const slot = slots[index];
          return slot ? (
            <DetailMini key={detail.id} detail={detail} index={index} slot={slot} />
          ) : null;
        })}
    </div>
  );
}
