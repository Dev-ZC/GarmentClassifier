import { useMemo, useState } from 'react';
import type { FacetItem } from '../../types';
import { IconChevronDown, IconSearch } from '../icons';
import './FilterPanel.css';

interface FilterPanelProps {
  facets: FacetItem[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  colorHex: string | null;
  onColorChange: (hex: string | null) => void;
}

// Heuristic for what to surface before the user asks for more: facets
// already arrive sorted by how often they occur across the library, so
// the head of that list is simply whatever has narrowed the most images
// historically - a decent proxy for "useful right now".
const SUGGESTED_COUNT = 8;

export function FilterPanel({
  facets,
  selectedTags,
  onToggleTag,
  colorHex,
  onColorChange,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const suggested = facets.slice(0, SUGGESTED_COUNT);
  const remainingCount = Math.max(0, facets.length - suggested.length);

  // Group every facet (including the already-suggested ones, so a pill
  // selected up top still shows as selected inside the full browser)
  // under its umbrella category - Fabric, Pattern, Garment, etc.
  const groups = useMemo(() => {
    const byCategory = new Map<string, FacetItem[]>();
    for (const facet of facets) {
      const list = byCategory.get(facet.category);
      if (list) list.push(facet);
      else byCategory.set(facet.category, [facet]);
    }
    return [...byCategory.entries()];
  }, [facets]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(([category, items]) => [category, items.filter((f) => f.value.toLowerCase().includes(q))] as const)
      .filter(([, items]) => items.length > 0);
  }, [groups, query]);

  const renderPill = (facet: FacetItem) => (
    <button
      key={facet.value}
      type="button"
      className={`filter-pill ${selectedTags.has(facet.value) ? 'filter-pill--selected' : ''}`}
      onClick={() => onToggleTag(facet.value)}
    >
      {facet.value}
    </button>
  );

  return (
    <div className="filter-panel">
      <div className="filter-panel__row">
        <div className="filter-panel__color">
          <label
            className="filter-panel__color-swatch"
            style={{ background: colorHex ?? 'var(--surface-3)' }}
          >
            <input
              type="color"
              value={colorHex ?? '#808080'}
              onChange={(e) => onColorChange(e.target.value)}
            />
            {!colorHex && <span className="filter-panel__color-hint">Pick a color</span>}
          </label>
          {colorHex && (
            <button type="button" className="filter-panel__color-clear" onClick={() => onColorChange(null)}>
              Clear color
            </button>
          )}
        </div>

        <div className="filter-panel__pills">
          {facets.length === 0 ? (
            <p className="filter-panel__hint">
              Filters will appear here as your images get tagged (fabric, fit, hardware, style...).
            </p>
          ) : (
            <>
              {suggested.map(renderPill)}
              {remainingCount > 0 && (
                <button
                  type="button"
                  className="filter-panel__more-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => setIsExpanded((open) => !open)}
                >
                  {isExpanded ? 'Hide filters' : `More filters (${remainingCount})`}
                  <IconChevronDown size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="filter-panel__browser">
          <div className="filter-panel__search">
            <IconSearch size={13} />
            <input
              type="text"
              placeholder="Search filters..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="filter-panel__groups">
            {visibleGroups.length === 0 ? (
              <p className="filter-panel__hint">No filters match "{query}".</p>
            ) : (
              visibleGroups.map(([category, items]) => (
                <div key={category} className="filter-panel__group">
                  <span className="filter-panel__group-label">{category}</span>
                  <div className="filter-panel__group-pills">{items.map(renderPill)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
