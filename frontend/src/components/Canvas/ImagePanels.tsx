import { useState } from 'react';
import { resolveImageUrl } from '../../api/client';
import type { ImageItem } from '../../types';
import { stopWheelIfScrollable } from '../../utils/scrollChain';
import { GarmentTypeIcon, IconCheck, IconX } from '../icons';
import './ImageCluster.css';
import './SwatchPanel.css';

export interface ImageDetails {
  note?: string;
  info_open?: boolean;
}

interface PanelProps {
  image: ImageItem;
  onUpdateDetails: (id: string, details: ImageDetails) => void;
}

function PanelHeader({ title, onUpdateDetails, imageId }: { title: string; imageId: string; onUpdateDetails: PanelProps['onUpdateDetails'] }) {
  return (
    <div className="image-card-panel__header">
      <span className="image-card-panel__title" title={title}>
        {title}
      </span>
      <button
        type="button"
        className="image-card-panel__close"
        onClick={() => onUpdateDetails(imageId, { info_open: false })}
        title="Hide details"
      >
        <IconX size={12} />
      </button>
    </div>
  );
}

// Copyable dominant-color rows, shared by the image and swatch panels.
function PanelColors({ image }: { image: ImageItem }) {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const copyHex = (hex: string) => {
    void navigator.clipboard.writeText(hex).catch(() => undefined);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex((current) => (current === hex ? null : current)), 1200);
  };

  if (image.dominant_colors.length === 0) return null;
  return (
    <div className="image-card-panel__section">
      <span className="image-card-panel__label">Colors</span>
      <div className="image-card-panel__colors">
        {image.dominant_colors.map((color) => (
          <button
            key={color.hex}
            type="button"
            className="image-card-panel__color"
            onClick={() => copyHex(color.hex)}
            title={`Copy ${color.hex}`}
          >
            <span className="image-card-panel__swatch" style={{ background: color.hex }}>
              {copiedHex === color.hex && <IconCheck size={11} />}
            </span>
            <span className="image-card-panel__hex">{color.hex}</span>
            <span className="image-card-panel__pct">
              {Math.round(color.percent * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// The larger info card of the cluster: filename, description, copyable
// color swatches and tags, plus any fabric swatches cropped out of this
// image during tagging (they live in the swatch bank, not the bento).
export function ImageInfoPanel({
  image,
  allTags,
  onUpdateDetails,
}: PanelProps & { allTags: string[] }) {
  const swatchDetails = image.details.filter((detail) => detail.is_swatch);

  return (
    <aside className="image-card-panel" onWheel={stopWheelIfScrollable}>
      <PanelHeader
        title={image.original_filename}
        imageId={image.id}
        onUpdateDetails={onUpdateDetails}
      />

      {image.description && (
        <p className="image-card-panel__description">{image.description}</p>
      )}

      <PanelColors image={image} />

      {swatchDetails.length > 0 && (
        <div className="image-card-panel__section">
          <span className="image-card-panel__label">Fabric swatches</span>
          <div className="image-card-panel__swatch-list">
            {swatchDetails.map((swatch) => (
              <div
                key={swatch.id}
                className="image-card-panel__swatch-item"
                title={swatch.description ?? swatch.fabric ?? 'Fabric swatch'}
              >
                <img
                  src={resolveImageUrl(swatch)}
                  alt={swatch.description ?? 'Fabric swatch'}
                  draggable={false}
                />
                <div className="image-card-panel__swatch-meta">
                  <span className="image-card-panel__swatch-name">
                    {swatch.fabric ?? swatch.description ?? 'Swatch'}
                  </span>
                  {swatch.dominant_colors.length > 0 && (
                    <span className="image-card-panel__swatch-dots">
                      {swatch.dominant_colors.slice(0, 4).map((color) => (
                        <i key={color.hex} style={{ background: color.hex }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="image-card-panel__section">
          <span className="image-card-panel__label">Tags</span>
          <div className="image-card-panel__tags">
            {allTags.map((tag) => (
              <span key={tag} className="image-card__tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// The swatch-bank counterpart to ImageInfoPanel: fabric name up top,
// the garment types it's suited to as mini icons, then colors and the
// VLM's description/tags.
export function SwatchInfoPanel({ image, onUpdateDetails }: PanelProps) {
  const title = image.fabric ?? image.original_filename;
  const allTags = [
    ...new Set(
      [image.fabric, image.pattern, ...image.style_tags, ...image.tags].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];

  return (
    <aside className="image-card-panel" onWheel={stopWheelIfScrollable}>
      <PanelHeader title={title} imageId={image.id} onUpdateDetails={onUpdateDetails} />

      {image.suitable_for.length > 0 && (
        <div className="image-card-panel__section">
          <span className="image-card-panel__label">Good for</span>
          <div className="swatch-panel__uses">
            {image.suitable_for.map((use) => (
              <span key={use} className="swatch-panel__use" title={use}>
                <GarmentTypeIcon name={use} size={14} />
                <span>{use}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {image.description && (
        <p className="image-card-panel__description">{image.description}</p>
      )}

      <PanelColors image={image} />

      {allTags.length > 0 && (
        <div className="image-card-panel__section">
          <span className="image-card-panel__label">Tags</span>
          <div className="image-card-panel__tags">
            {allTags.map((tag) => (
              <span key={tag} className="image-card__tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
