import { resolveImageUrl } from '../../api/client';
import type { SearchResult } from '../../types';
import { SEARCH_DRAG_TYPE } from '../Canvas/Board';
import { GarmentTypeIcon, IconCheck, IconTarget, IconTrash } from '../icons';
import './ResultsGrid.css';

interface ResultsGridProps {
  results: SearchResult[];
  isLoading: boolean;
  selectedIds: Set<string>;
  activeBoardId: string | null;
  onToggleSelect: (imageId: string) => void;
  onLocate: (imageId: string) => void;
  onDragStateChange: (isDragging: boolean) => void;
  onDeleteImage: (imageId: string) => void;
  /** Noun for the empty state - "images" or "swatches". */
  emptyLabel?: string;
}

export function ResultsGrid({
  results,
  isLoading,
  selectedIds,
  activeBoardId,
  onToggleSelect,
  onLocate,
  onDragStateChange,
  onDeleteImage,
  emptyLabel = 'images',
}: ResultsGridProps) {
  if (isLoading && results.length === 0) {
    return <p className="results-grid__hint">Searching...</p>;
  }
  if (results.length === 0) {
    return <p className="results-grid__hint">No matching {emptyLabel} yet.</p>;
  }

  const handleDragStart = (e: React.DragEvent, imageId: string) => {
    // Dragging one selected card carries the whole selection to the board.
    const ids = selectedIds.has(imageId) ? [...selectedIds] : [imageId];
    e.dataTransfer.setData(SEARCH_DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStateChange(true);
  };

  return (
    <div className="results-grid">
      {results.map(({ image, matched_color }) => {
        const primaryGarment = image.garments[0];
        const label = image.is_swatch
          ? (image.fabric ?? image.style_tags[0])
          : (primaryGarment?.garment_type ?? image.pattern ?? image.fabric ?? image.style_tags[0]);
        const isSelected = selectedIds.has(image.id);
        const isOnBoard = activeBoardId !== null && image.board_ids.includes(activeBoardId);
        return (
          <button
            key={image.id}
            type="button"
            className={`results-grid__item ${isSelected ? 'results-grid__item--selected' : ''}`}
            onClick={() => onToggleSelect(image.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, image.id)}
            onDragEnd={() => onDragStateChange(false)}
            style={{ aspectRatio: `${image.width || 1} / ${image.height || 1}` }}
          >
            <img src={resolveImageUrl(image)} alt={image.original_filename} loading="lazy" />
            <span
              className={`results-grid__check ${isSelected ? 'results-grid__check--on' : ''}`}
              aria-hidden
            >
              <IconCheck size={12} />
            </span>
            <span
              className="results-grid__delete"
              title={
                image.is_swatch
                  ? 'Delete fabric swatch'
                  : image.parent_id
                    ? 'Delete detail photo'
                    : 'Delete image'
              }
              onClick={(e) => {
                e.stopPropagation();
                onDeleteImage(image.id);
              }}
            >
              <IconTrash size={12} />
            </span>
            {isOnBoard && (
              <span
                className="results-grid__locate"
                title="Show on board"
                onClick={(e) => {
                  e.stopPropagation();
                  onLocate(image.id);
                }}
              >
                <IconTarget size={12} />
              </span>
            )}
            {(label || matched_color || image.parent_id) && (
              <div className="results-grid__caption">
                {matched_color && (
                  <span className="results-grid__swatch" style={{ background: matched_color.hex }} />
                )}
                {label && <span>{label}</span>}
                {/* Swatches advertise what the fabric suits via the same
                    mini garment icons used on the board card. */}
                {image.is_swatch && image.suitable_for.length > 0 && (
                  <span className="results-grid__uses" title={image.suitable_for.join(', ')}>
                    {image.suitable_for.slice(0, 3).map((use) => (
                      <GarmentTypeIcon key={use} name={use} size={11} />
                    ))}
                  </span>
                )}
                {image.parent_id && !image.is_swatch && (
                  <span className="results-grid__detail" title="Detail crop from a larger image">
                    detail
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
