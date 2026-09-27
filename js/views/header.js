// App shell: search box, List/Calendar switch, and the sidebar drawer (< 720px).

const SEARCH_DEBOUNCE_MS = 150;

let ctx = null;
let els = null;
let searchTimer = null;
let drawerOpen = false;

export function initHeader(elements, context) {
  els = elements;
  ctx = context;

  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = null;
      ctx.dispatch({ type: 'setSearch', search: els.search.value });
    }, SEARCH_DEBOUNCE_MS);
  });
  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.search.value !== '') {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
    }
  });

  els.viewSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) ctx.dispatch({ type: 'setView', view: button.dataset.view });
  });

  els.menuButton.addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));
  els.scrim.addEventListener('click', () => closeDrawer());
  els.wideQuery.addEventListener('change', () => {
    if (els.wideQuery.matches && drawerOpen) closeDrawer({ returnFocus: false });
  });
}

/** Empties the search box and drops any pending update, without dispatching. */
export function resetSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = null;
  els.search.value = '';
}

export function clearSearch() {
  resetSearchInput();
  ctx.dispatch({ type: 'setSearch', search: '' });
}

export function isDrawerOpen() {
  return drawerOpen;
}

export function openDrawer() {
  drawerOpen = true;
  els.sidebar.classList.add('open');
  els.scrim.hidden = false;
  els.menuButton.setAttribute('aria-expanded', 'true');
  for (const el of els.inertWhileDrawer) el.inert = true;
  els.sidebar.querySelector('button, input')?.focus();
}

export function closeDrawer({ returnFocus = true } = {}) {
  if (!drawerOpen) return;
  drawerOpen = false;
  els.sidebar.classList.remove('open');
  els.scrim.hidden = true;
  els.menuButton.setAttribute('aria-expanded', 'false');
  for (const el of els.inertWhileDrawer) el.inert = false;
  if (returnFocus) els.menuButton.focus();
}

export function renderHeader(state) {
  for (const button of els.viewSwitch.querySelectorAll('[data-view]')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  }
  // Follow the state when the search is cleared elsewhere (e.g. "Clear all"),
  // but never while a debounced update is still pending.
  if (searchTimer === null && els.search.value !== state.filters.search) {
    els.search.value = state.filters.search;
  }
}
