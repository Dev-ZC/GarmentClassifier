import type { ReactNode } from 'react';

// One stroke width (2.25 on a 24px grid) across every icon so they read
// with consistent weight at any rendered size - pass `size` per context.
interface IconProps {
  size?: number;
}

function baseProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function IconSun({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconMoon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCenter({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLayers({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export function IconChevronDown({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconPencil({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export function IconTrash({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
    </svg>
  );
}

export function IconX({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconTarget({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconUpload({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

export function IconInfo({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M12 11v5" />
    </svg>
  );
}

export function IconStickyNote({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M4 3h16a1 1 0 0 1 1 1v11l-6 6H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M21 15h-6v6" />
    </svg>
  );
}

export function IconCopy({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconPin({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </svg>
  );
}

export function IconBold({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M7 4h6a3.5 3.5 0 0 1 0 7H7zM7 11h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

export function IconItalic({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M11 4h6M7 20h6M14 4 10 20" />
    </svg>
  );
}

export function IconListBullets({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

export function IconCheckSquare({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7.5 12l3 3 6-6" />
    </svg>
  );
}

export function IconTextLines({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function IconChevronUp({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function IconTag({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12.59 2.59 21 11l-9 9-8.41-8.41A2 2 0 0 1 3 10.17V4a1 1 0 0 1 1-1h6.17a2 2 0 0 1 1.42.59z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSearch({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function IconDroplet({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    </svg>
  );
}

/* ---- Canvas element icons: floating text label + simple shapes ---- */

export function IconText({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  );
}

export function IconSquare({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function IconCircle({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function IconArrowRight({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

// Toolbar entry for the element picker - overlapping square + circle,
// the usual "shapes" glyph.
export function IconShapes({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="3" y="9" width="11" height="11" rx="2" />
      <circle cx="16" cy="8.5" r="5.5" />
    </svg>
  );
}

export function IconFlipHorizontal({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <path d="M8 8 4 12l4 4M16 8l4 4-4 4" />
    </svg>
  );
}

export function IconFlipVertical({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M3 12h18" strokeDasharray="3 3" />
      <path d="M8 8l4-4 4 4M8 16l4 4 4-4" />
    </svg>
  );
}

/* ---- Fabric swatch + garment-type mini icons. The garment set powers
   the "good for" icon row on swatch cards (a swatch suited to jackets
   and polos shows a mini jacket + polo); GarmentTypeIcon maps a free-
   text garment name onto the closest glyph. ---- */

export function IconSwatch({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="3" y="8" width="13" height="13" rx="2" />
      <path d="M7 8V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

export function IconJacket({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8.5 3.5 4 6.5 5 20h14l1-13.5L15.5 3.5" />
      <path d="M8.5 3.5 12 7l3.5-3.5M12 7v13" />
    </svg>
  );
}

export function IconShirt({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M9 4 4 7l2 4 2-1v10h8V10l2 1 2-4-5-3" />
      <path d="M9 4l3 2 3-2M12 8v12" />
    </svg>
  );
}

export function IconTShirt({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8 4 3 8l3 3 2-1.5V20h8V9.5L18 11l3-3-5-4" />
      <path d="M8 4c1 1.5 2.4 2.2 4 2.2S15 5.5 16 4" />
    </svg>
  );
}

export function IconSweater({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8 4 4 8v3l2 1v8h12v-8l2-1V8l-4-4" />
      <path d="M8 4a3.2 3.2 0 0 0 8 0M9 16h6" />
    </svg>
  );
}

export function IconPants({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M7 3h10l1 18h-5l-1-9.5L11 21H6L7 3z" />
      <path d="M7 6h10" />
    </svg>
  );
}

export function IconShorts({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M6 4h12l1 9h-6l-1-3-1 3H5L6 4z" />
      <path d="M6 7h12" />
    </svg>
  );
}

export function IconDress({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M9 3c.5 1.5 1.6 2.2 3 2.2S14.5 4.5 15 3l1.6 8L20 20H4l3.4-9L9 3z" />
    </svg>
  );
}

export function IconSkirt({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8 4h8M8 4 5 20h14L16 4" />
      <path d="M8 7h8" />
    </svg>
  );
}

export function IconShoe({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M3 17h18v-2.5c-4-1.4-8-1.9-11.5-3L7 8H4l-1 9z" />
    </svg>
  );
}

export function IconBag({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="5" y="9" width="14" height="11" rx="2" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function IconHat({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M7 14a5 5 0 0 1 10 0" />
      <path d="M3 14h18l1.5 2.5H1.5L3 14z" />
    </svg>
  );
}

type GarmentIconComponent = (props: IconProps) => ReactNode;

// First match wins - order matters ("sweatshirt" should hit sweater
// before shirt, "polo shirt" before generic pants fallthrough etc).
const GARMENT_ICON_RULES: [RegExp, GarmentIconComponent][] = [
  [/jacket|coat|blazer|parka|anorak|outerwear|suit|tuxedo|windbreaker|bomber|denim jacket/, IconJacket],
  [/polo|button|oxford|flannel|blouse|shirt/, IconShirt],
  [/t-?shirt|tee\b|vest|tank/, IconTShirt],
  [/sweat|hoodie|knit|sweater|jumper|cardigan|pullover/, IconSweater],
  [/short/, IconShorts],
  [/jean|pant|trouser|chino|slack|cargo|legging/, IconPants],
  [/dress|gown/, IconDress],
  [/skirt/, IconSkirt],
  [/shoe|boot|sneaker|footwear|heel|sandal|loafer|trainers/, IconShoe],
  [/bag|tote|backpack|handbag|purse|clutch|luggage/, IconBag],
  [/hat|cap|beanie|beret|millinery/, IconHat],
];

export function GarmentTypeIcon({ name, size = 14 }: { name: string; size?: number }) {
  const lower = name.toLowerCase();
  const Icon = GARMENT_ICON_RULES.find(([pattern]) => pattern.test(lower))?.[1] ?? IconTag;
  return <Icon size={size} />;
}
