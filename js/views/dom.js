// Small DOM helpers shared by the views. User text only ever goes through
// textContent or attributes, never through HTML parsing.

const PROPERTIES = new Set(['checked', 'value', 'hidden', 'disabled', 'selected', 'tabIndex']);

/**
 * h('button', { class: 'x', text: 'Hi', 'aria-label': 'Say hi' }, child…)
 * `text` sets textContent; `dataset` is merged; false/null attributes are skipped.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (PROPERTIES.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  prev: ['M15 6l-6 6 6 6'],
  next: ['M9 6l6 6-6 6'],
};

/** A decorative stroke icon. Give its button an aria-label. */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function findByKey(root, key) {
  return root.querySelector(`[data-key="${CSS.escape(key)}"]`);
}

/**
 * Replaces root's children, keeping focus (and text selection) on the
 * element with the same data-key if there is one.
 */
export function renderInto(root, ...children) {
  const active = document.activeElement;
  const hadFocus = root.contains(active) && active !== root;
  const key = hadFocus ? active.dataset.key : undefined;
  const selection = hadFocus && typeof active.selectionStart === 'number'
    ? [active.selectionStart, active.selectionEnd]
    : null;

  root.replaceChildren();
  append(root, children);

  if (!key) return;
  const next = findByKey(root, key);
  if (!next) return;
  next.focus({ preventScroll: true });
  if (selection && typeof next.setSelectionRange === 'function') {
    try {
      next.setSelectionRange(...selection);
    } catch {
      // Some input types (e.g. date) don't support selection.
    }
  }
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const TYPING_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'number', 'password', 'tel', 'url', 'date', 'datetime-local', 'month', 'time', 'week',
]);

/** True while the user is typing somewhere a shortcut key would be text. */
export function isTypingTarget(el) {
  if (!(el instanceof Element)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && TYPING_INPUT_TYPES.has(el.type);
}
