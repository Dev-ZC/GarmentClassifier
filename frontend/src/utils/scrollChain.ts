// Lets a scrollable panel (note body, checklist, info panel, per-image
// note) consume a two-finger trackpad/wheel gesture only while it can
// still scroll further in that direction - once it hits an edge (or has
// no overflow at all), the event is left alone so it bubbles up and
// react-zoom-pan-pinch keeps panning the board instead of the gesture
// just going dead. Attach directly to the scrollable element itself
// (the one with `overflow-y: auto`), not a non-scrolling wrapper.
export function stopWheelIfScrollable(e: React.WheelEvent<HTMLElement>): void {
  const el = e.currentTarget;
  if (el.scrollHeight <= el.clientHeight) return;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
    e.stopPropagation();
  }
}
