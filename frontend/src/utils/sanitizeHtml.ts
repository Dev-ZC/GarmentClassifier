// Minimal allowlist sanitizer for note bodies edited via
// `contentEditable` + `document.execCommand`. Browsers only ever emit a
// small set of formatting tags from those commands (bold/italic/list),
// but we strip everything else (and every attribute) as defense in
// depth before the HTML is persisted and re-rendered.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'LI', 'BR', 'DIV', 'SPAN']);

export function sanitizeNoteHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  stripDisallowed(template.content);
  return template.innerHTML;
}

function stripDisallowed(root: Node): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      // Unwrap disallowed elements (e.g. <script>, <img>) but keep any
      // text/child nodes they contained.
      while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    stripDisallowed(el);
  }
}
