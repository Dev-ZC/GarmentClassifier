import { useCallback, useEffect, useRef, useState } from 'react';
import { getFacets, getSwatchFacets, searchImages, searchSwatches } from '../../api/client';
import type { FacetItem, ImageItem, SearchResult } from '../../types';
import { IconSwatch, IconUpload } from '../icons';
import { FilterPanel } from './FilterPanel';
import { ResultsGrid } from './ResultsGrid';
import './SearchOverlay.css';

const DEBOUNCE_MS = 300;

// The overlay searches two disjoint pools: the image library (default)
// and the fabric swatch bank. Swatches never appear in image results
// and vice versa - switching tabs swaps the endpoint, facets and
// upload target, not just the filter.
type SearchMode = 'images' | 'swatches';

interface SearchOverlayProps {
  activeBoardId: string | null;
  onSelectResult: (imageId: string) => void;
  onAddToBoard: (imageIds: string[]) => void;
  onUploadToLibrary: (file: File) => Promise<ImageItem | null>;
  onUploadSwatch: (file: File) => Promise<ImageItem | null>;
  onDeleteImage: (imageId: string) => Promise<void>;
}

export function SearchOverlay({
  activeBoardId,
  onSelectResult,
  onAddToBoard,
  onUploadToLibrary,
  onUploadSwatch,
  onDeleteImage,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [colorHex, setColorHex] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  // Once opened the panel stays open until Escape or a backdrop click -
  // keyed off input blur before, which unmounted the panel mid-click and
  // swallowed interactions with pills, the color picker, and buttons.
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>('images');
  const [facets, setFacets] = useState<FacetItem[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDraggingResult, setIsDraggingResult] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);



  const runSearch = useCallback(() => {
    setIsSearching(true);
    const payload = {
      query: query.trim() || undefined,
      color_hex: colorHex ?? undefined,
      attribute_tags: selectedTags.size ? [...selectedTags] : undefined,
    };
    const search = mode === 'swatches' ? searchSwatches : searchImages;
    return search(payload)
      .then(setResults)
      .catch((err: Error) => console.error('Search failed:', err))
      .finally(() => setIsSearching(false));
  }, [mode, query, colorHex, selectedTags]);

  // Switching pools swaps endpoint + facets; selections carry image ids
  // from one pool so they're cleared to avoid a stale "Add to board".
  const switchMode = useCallback((next: SearchMode) => {
    setMode(next);
    setSelectedIds(new Set());
  }, []);

  // Refresh the filter pills each time the panel opens (or the pool
  // changes), in case more images finished tagging since it was shown.
  useEffect(() => {
    if (!isOpen) return;
    const fetchFacets = mode === 'swatches' ? getSwatchFacets : getFacets;
    fetchFacets().then(setFacets).catch((err) => console.error(err));
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(runSearch, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isOpen, runSearch]);

  const clear = () => {
    setQuery('');
    setColorHex(null);
    setSelectedTags(new Set());
    setSelectedIds(new Set());
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const toggleSelect = (imageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  // Permanently removes an image from the library (not just this
  // results view). Deleting a parent also drops its detail crops server
  // side, so those have to be pruned from local state too, even though
  // the user only clicked delete on the one card.
  const handleDeleteImage = useCallback(
    (imageId: string) => {
      const target = results.find((r) => r.image.id === imageId);
      if (!target) return;
      const detailCount = target.image.details.length;
      const isDetail = target.image.parent_id !== null && !target.image.is_swatch;
      const message = target.image.is_swatch
        ? 'Delete this fabric swatch? This cannot be undone.'
        : isDetail
        ? 'Delete this detail photo? This cannot be undone.'
        : detailCount > 0
          ? `Delete this image and its ${detailCount} detail photo${
              detailCount === 1 ? '' : 's'
            }? This cannot be undone.`
          : 'Delete this image? This cannot be undone.';
      if (!window.confirm(message)) return;

      const removedIds = new Set([imageId, ...target.image.details.map((d) => d.id)]);
      setResults((prev) => prev.filter((r) => !removedIds.has(r.image.id)));
      setSelectedIds((prev) => {
        if (![...removedIds].some((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        removedIds.forEach((id) => next.delete(id));
        return next;
      });

      onDeleteImage(imageId).catch((err: Error) => console.error('Delete failed:', err));
    },
    [results, onDeleteImage],
  );

  // Files uploaded here go to the active pool only - tagged and
  // searchable, but not placed on any board. In swatch mode they land
  // in the fabric swatch bank instead of the image library.
  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      for (const file of images) {
        if (mode === 'swatches') await onUploadSwatch(file);
        else await onUploadToLibrary(file);
      }
      if (images.length > 0) await runSearch();
    },
    [mode, onUploadSwatch, onUploadToLibrary, runSearch],
  );

  return (
    <>
      {isOpen && (
        <div
          className={`search-overlay-backdrop ${
            isDraggingResult ? 'search-overlay-backdrop--passthrough' : ''
          }`}
          onClick={clear}
        />
      )}
      <div className={`search-overlay ${isOpen ? 'search-overlay--active' : ''}`}>
        <form
          className="search-overlay__bar"
          onSubmit={(e) => {
            e.preventDefault();
            inputRef.current?.blur();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={
              isOpen && mode === 'swatches'
                ? 'Search swatches - fabric, color, garment use...'
                : 'Search fabric, fit, hardware, style...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') clear();
            }}
          />
        </form>

        {isOpen && (
          <div
            className="search-overlay__panel"
            onDragOver={(e) => {
              // Only file drops upload to the library - drags of result
              // cards pass through untouched.
              if (e.dataTransfer.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length === 0) return;
              e.preventDefault();
              void uploadFiles(files);
            }}
          >
            <div className="search-overlay__panel-header">
              <div className="search-overlay__tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'images'}
                  className={`search-overlay__tab ${mode === 'images' ? 'search-overlay__tab--active' : ''}`}
                  onClick={() => switchMode('images')}
                >
                  Images
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'swatches'}
                  className={`search-overlay__tab ${mode === 'swatches' ? 'search-overlay__tab--active' : ''}`}
                  onClick={() => switchMode('swatches')}
                >
                  <IconSwatch size={12} />
                  Swatches
                </button>
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void uploadFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="search-overlay__upload"
                onClick={() => uploadInputRef.current?.click()}
                title={
                  mode === 'swatches'
                    ? 'Upload fabric swatches to the swatch bank'
                    : 'Upload images to your library without adding them to a board'
                }
              >
                <IconUpload size={13} />
                {mode === 'swatches' ? 'Upload swatches' : 'Upload images'}
              </button>
            </div>
            <FilterPanel
              facets={facets}
              selectedTags={selectedTags}
              onToggleTag={toggleTag}
              colorHex={colorHex}
              onColorChange={setColorHex}
            />
            <div className="search-overlay__scroll">
              <ResultsGrid
                results={results}
                isLoading={isSearching}
                selectedIds={selectedIds}
                activeBoardId={activeBoardId}
                onToggleSelect={toggleSelect}
                onLocate={onSelectResult}
                onDragStateChange={setIsDraggingResult}
                onDeleteImage={handleDeleteImage}
                emptyLabel={mode === 'swatches' ? 'swatches' : 'images'}
              />
            </div>
            {selectedIds.size > 0 && (
              <div className="search-overlay__actions">
                <span>
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  className="search-overlay__add"
                  onClick={() => {
                    onAddToBoard([...selectedIds]);
                    setSelectedIds(new Set());
                  }}
                >
                  Add to board
                </button>
                <button
                  type="button"
                  className="search-overlay__clear-selection"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
