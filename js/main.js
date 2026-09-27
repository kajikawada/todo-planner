// Bootstrap: load state, wire global events, render on every state change.

import { filterTasks, quickAddFields, validateTitle } from './model.js';
import {
  createInitialState, dispatch, getState, initStore, selectData, selectPersistedUi, subscribe,
} from './store.js';
import {
  DATA_KEY, createSaver, defaultBackend, load, loadUi, readData, saveUi,
} from './storage.js';
import { today as todayOf } from './utils/date.js';
import { renderCalendar, clearCalendar, initCalendar } from './views/calendar.js';
import {
  initDialog, isDialogOpen, openEditor, syncDialog,
} from './views/dialog.js';
import { findByKey, isTypingTarget, pluralize } from './views/dom.js';
import { initFilterBar, renderFilterBar } from './views/filters.js';
import {
  closeDrawer, initHeader, isDrawerOpen, renderHeader, resetSearchInput,
} from './views/header.js';
import { clearList, initList, renderList } from './views/list.js';
import {
  clearBanner, hideToast, initNotices, setBanner, showToast,
} from './views/notices.js';
import { initSidebar, renderSidebar } from './views/sidebar.js';
import { rowKey } from './views/task-row.js';

const $ = (selector) => document.querySelector(selector);

const els = {
  sidebar: $('#sidebar'),
  scrim: $('#scrim'),
  menuButton: $('#menu-button'),
  search: $('#search'),
  viewSwitch: $('#view-switch'),
  main: $('#main'),
  quickAdd: $('#quick-add'),
  quickAddInput: $('#quick-add-input'),
  quickAddHint: $('#quick-add-hint'),
  filterBar: $('#filter-bar'),
  listView: $('#list-view'),
  calendarView: $('#calendar-view'),
  live: $('#live'),
};

// ---------------------------------------------------------------------------
// Load

const backend = defaultBackend();
const loaded = load(backend);
// If corrupt data couldn't be backed up, don't overwrite it.
const canSave = backend !== null && loaded.warning !== 'unavailable'
  && !(loaded.warning === 'corrupt' && loaded.backupKey === null);

initStore(createInitialState({
  data: loaded.data,
  ui: loadUi(backend),
  today: todayOf(new Date()),
}));

// ---------------------------------------------------------------------------
// Saving

function onSaveResult(result) {
  if (result.ok) {
    clearBanner('quota');
  } else if (result.error === 'quota') {
    setBanner('quota', { message: 'Storage is full. Your latest changes may not be saved.' });
  } else {
    setBanner('unavailable', {
      message: 'Browser storage is unavailable. The planner is running in memory, so changes won’t be kept after you close it.',
    });
  }
}

const dataSaver = createSaver(backend, 200, { onResult: onSaveResult });
const uiSaver = createSaver(backend, 200, { write: saveUi, onResult: onSaveResult });

function flushSaves() {
  dataSaver.flush();
  uiSaver.flush();
}

// ---------------------------------------------------------------------------
// Focus management across re-renders

let pendingFocus = null;

/** After the next render, focus the first element found among `keys`, else `fallback`. */
function focusAfterRender(keys, fallback = null) {
  pendingFocus = { keys, fallback };
}

function applyPendingFocus() {
  if (!pendingFocus) return;
  const { keys, fallback } = pendingFocus;
  pendingFocus = null;
  for (const key of keys) {
    const el = findByKey(document.body, key);
    if (el && el.offsetParent !== null) {
      el.focus();
      return;
    }
  }
  fallback?.focus();
}

function activeRegion() {
  return getState().view === 'calendar' ? els.calendarView : els.listView;
}

/** The key of the row after (or before) `id`, for when that row disappears. */
function neighborKeys(id, region = activeRegion()) {
  const rows = [...region.querySelectorAll('.task-row')];
  const index = rows.findIndex((row) => row.dataset.taskId === id);
  if (index === -1) return [];
  return [rows[index + 1], rows[index - 1]].filter(Boolean).map((row) => row.dataset.key);
}

// ---------------------------------------------------------------------------
// Actions shared by the views

const newId = () => (typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  // randomUUID needs a secure context; fall back when served over plain http.
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (
    Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
  ).toString(16)));

const now = () => new Date().toISOString();

function announce(message) {
  // Clear first so repeating the same text is announced again.
  els.live.textContent = '';
  setTimeout(() => {
    els.live.textContent = message;
  }, 50);
}

const ctx = {
  dispatch,
  getState,
  now,
  announce,
  showToast,
  closeDrawer,
  refresh: () => render(getState()),
  focusKey: (key) => {
    focusAfterRender([key]);
    applyPendingFocus();
  },
  focusQuickAdd: () => els.quickAddInput.focus(),

  /** Adds a task from quick-add text with the current filters. Returns an error or null. */
  quickAdd(text) {
    const state = getState();
    const fields = quickAddFields(text, state.filters);
    const error = validateTitle(fields.title);
    if (error) return fields.title === '' && text.trim() !== '' ? 'A task needs a title, not just tags.' : error;
    dispatch({ type: 'addTask', fields, id: newId(), now: now() });
    announce(`Added “${fields.title}”.`);
    return null;
  },

  toggleComplete(id, region) {
    focusAfterRender([rowKey(id), ...neighborKeys(id, region)], region);
    dispatch({ type: 'toggleComplete', id, now: now() });
  },

  deleteTask(id, region = activeRegion()) {
    const task = getState().tasks.find((t) => t.id === id);
    if (!task) return;
    focusAfterRender(neighborKeys(id, region), region);
    dispatch({ type: 'deleteTask', id });
    showToast({
      message: `Deleted “${task.title}”`,
      actionLabel: 'Undo',
      onAction: () => {
        focusAfterRender([rowKey(id)], activeRegion());
        dispatch({ type: 'undoDelete' });
        announce(`Restored “${task.title}”.`);
      },
      onExpire: () => dispatch({ type: 'commitDelete' }),
    });
  },

  openEditor: (id) => openEditor(id),

  restoreFocusToTask(id) {
    focusAfterRender([rowKey(id), ...neighborKeys(id)], activeRegion());
    applyPendingFocus();
  },

  clearFilters() {
    resetSearchInput();
    dispatch({ type: 'clearFilters' });
    focusAfterRender([], els.quickAddInput);
    applyPendingFocus();
  },
};

// ---------------------------------------------------------------------------
// Render

function render(state) {
  document.body.dataset.view = state.view;
  renderHeader(state);
  renderSidebar(state);
  renderFilterBar(state);
  els.listView.hidden = state.view !== 'list';
  els.calendarView.hidden = state.view !== 'calendar';
  if (state.view === 'list') {
    clearCalendar();
    renderList(state);
  } else {
    clearList();
    renderCalendar(state);
  }
  syncDialog(state);
  applyPendingFocus();
}

const FILTER_ACTIONS = new Set([
  'setStatus', 'toggleCategoryFilter', 'toggleTagFilter', 'toggleDayFilter', 'setSearch', 'clearFilters', 'setView',
]);

subscribe((state, prev, action) => {
  if (action.type !== 'replaceData' && canSave
    && (state.tasks !== prev.tasks || state.categories !== prev.categories)) {
    dataSaver.save(selectData(state));
  }
  const ui = selectPersistedUi(state);
  if (canSave && JSON.stringify(ui) !== JSON.stringify(selectPersistedUi(prev))) uiSaver.save(ui);

  render(state);

  if (FILTER_ACTIONS.has(action.type)) {
    announce(`${pluralize(filterTasks(state.tasks, state.filters).length, 'task')} shown.`);
  }
});

// ---------------------------------------------------------------------------
// Wire up

initNotices({ toasts: $('#toast-region'), banners: $('#banners') });
initHeader({
  search: els.search,
  viewSwitch: els.viewSwitch,
  menuButton: els.menuButton,
  sidebar: els.sidebar,
  scrim: els.scrim,
  wideQuery: window.matchMedia('(min-width: 720px)'),
  inertWhileDrawer: [$('.app-header'), els.main, $('#banners')],
}, ctx);
initSidebar(els.sidebar, ctx);
initFilterBar(els.filterBar, ctx);
initList(els.listView, ctx);
initCalendar(els.calendarView, ctx);
initDialog($('#edit-dialog'), ctx);

els.quickAdd.addEventListener('submit', (event) => {
  event.preventDefault();
  const error = ctx.quickAdd(els.quickAddInput.value);
  els.quickAddHint.textContent = error ?? '';
  if (!error) els.quickAddInput.value = '';
  els.quickAddInput.focus();
});
els.quickAddInput.addEventListener('input', () => {
  els.quickAddHint.textContent = '';
});

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  if (event.key === 'Escape') {
    if (isDrawerOpen()) {
      event.preventDefault();
      closeDrawer();
    }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || isDialogOpen()) return;
  if (isTypingTarget(event.target)) return;
  if (event.key === 'n' || event.key === '/') {
    event.preventDefault();
    if (isDrawerOpen()) closeDrawer({ returnFocus: false });
    (event.key === 'n' ? els.quickAddInput : els.search).focus();
  }
});

// "Today" follows the local calendar date; recheck when the page regains focus.
function refreshToday() {
  dispatch({ type: 'setToday', today: todayOf(new Date()) });
}
window.addEventListener('focus', refreshToday);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshToday();
  else flushSaves();
});
setInterval(refreshToday, 60000);

window.addEventListener('pagehide', flushSaves);

// Another tab saved: take its data (last write wins).
window.addEventListener('storage', (event) => {
  if (event.key !== DATA_KEY || event.storageArea !== backend) return;
  const data = readData(backend);
  if (data) dispatch({ type: 'replaceData', data });
});

// Startup notices
if (loaded.warning === 'corrupt') {
  setBanner('corrupt', {
    dismissible: true,
    message: loaded.backupKey
      ? `Saved data couldn’t be read, so the planner started empty. The old data was backed up under “${loaded.backupKey}”.`
      : 'Saved data couldn’t be read or backed up, so the planner started empty and won’t save until storage has room.',
  });
} else if (loaded.warning === 'unavailable') {
  onSaveResult({ ok: false, error: 'unavailable' });
} else if (loaded.warning === 'quota') {
  onSaveResult({ ok: false, error: 'quota' });
}

hideToast();
render(getState());
