// Single app state, a pure reducer, and a tiny pub/sub.
// Actions that need an id or the time carry them (`id`, `now`) so `reduce` stays pure.

import {
  DEFAULT_FILTERS, SORT_KEYS, STATUSES,
  createTask, editTask, normalizeTag, setCompleted, validateCategoryName, validateTask,
} from './model.js';
import { isValidISODate, monthOf } from './utils/date.js';

export const DEFAULT_UI = Object.freeze({ view: 'list', sort: 'default', weekStart: 1 });

/** Builds the starting state. `ui` holds the persisted UI fields (any may be missing). */
export function createInitialState({ data, ui = {}, today }) {
  return {
    tasks: data.tasks,
    categories: data.categories,
    today,
    view: ui.view ?? DEFAULT_UI.view,
    month: ui.month ?? monthOf(today),
    sort: ui.sort ?? DEFAULT_UI.sort,
    weekStart: ui.weekStart ?? DEFAULT_UI.weekStart,
    filters: DEFAULT_FILTERS,
    lastDeleted: null,
  };
}

/** The part of state saved under `todo-planner:ui`. */
export function selectPersistedUi(state) {
  return { view: state.view, month: state.month, sort: state.sort, weekStart: state.weekStart };
}

export function selectData(state) {
  return { version: 1, tasks: state.tasks, categories: state.categories };
}

const setFilters = (state, changes) => ({ ...state, filters: { ...state.filters, ...changes } });

function replaceTask(state, id, update) {
  const index = state.tasks.findIndex((t) => t.id === id);
  if (index === -1) return state;
  const next = update(state.tasks[index]);
  if (!validateTask(next, state.categories).valid) return state;
  const tasks = state.tasks.slice();
  tasks[index] = next;
  return { ...state, tasks };
}

const handlers = {
  addTask(state, { fields, id, now }) {
    const task = createTask(fields, { id, now });
    if (!validateTask(task, state.categories).valid) return state;
    if (state.tasks.some((t) => t.id === id)) return state;
    return { ...state, tasks: [...state.tasks, task] };
  },

  updateTask(state, { id, fields, now }) {
    return replaceTask(state, id, (task) => editTask(task, fields, now));
  },

  toggleComplete(state, { id, now }) {
    return replaceTask(state, id, (task) => setCompleted(task, !task.completed, now));
  },

  deleteTask(state, { id }) {
    const index = state.tasks.findIndex((t) => t.id === id);
    if (index === -1) return state;
    return {
      ...state,
      tasks: state.tasks.filter((t) => t.id !== id),
      lastDeleted: { task: state.tasks[index], index },
    };
  },

  undoDelete(state) {
    const { lastDeleted } = state;
    if (!lastDeleted || state.tasks.some((t) => t.id === lastDeleted.task.id)) {
      return lastDeleted ? { ...state, lastDeleted: null } : state;
    }
    const tasks = state.tasks.slice();
    tasks.splice(Math.min(lastDeleted.index, tasks.length), 0, lastDeleted.task);
    return { ...state, tasks, lastDeleted: null };
  },

  commitDelete(state) {
    return state.lastDeleted ? { ...state, lastDeleted: null } : state;
  },

  addCategory(state, { name }) {
    if (validateCategoryName(name, state.categories)) return state;
    return { ...state, categories: [...state.categories, name.trim()] };
  },

  renameCategory(state, { from, to, now }) {
    if (!state.categories.includes(from)) return state;
    if (validateCategoryName(to, state.categories, from)) return state;
    const name = to.trim();
    if (name === from) return state;
    return {
      ...state,
      categories: state.categories.map((c) => (c === from ? name : c)),
      tasks: state.tasks.map((t) => (t.category === from
        ? { ...t, category: name, updatedAt: now }
        : t)),
      filters: state.filters.category === from
        ? { ...state.filters, category: name }
        : state.filters,
    };
  },

  deleteCategory(state, { name, now }) {
    if (!state.categories.includes(name)) return state;
    return {
      ...state,
      categories: state.categories.filter((c) => c !== name),
      tasks: state.tasks.map((t) => (t.category === name
        ? { ...t, category: null, updatedAt: now }
        : t)),
      filters: state.filters.category === name
        ? { ...state.filters, category: null }
        : state.filters,
    };
  },

  /** Another tab wrote new data. */
  replaceData(state, { data }) {
    const { category } = state.filters;
    return {
      ...state,
      tasks: data.tasks,
      categories: data.categories,
      filters: category !== null && !data.categories.includes(category)
        ? { ...state.filters, category: null }
        : state.filters,
    };
  },

  setToday(state, { today }) {
    return state.today === today ? state : { ...state, today };
  },

  setView(state, { view }) {
    return view === 'list' || view === 'calendar' ? { ...state, view } : state;
  },

  setMonth(state, { year, month }) {
    return { ...state, month: { year, month } };
  },

  setSort(state, { sort }) {
    return SORT_KEYS.includes(sort) ? { ...state, sort } : state;
  },

  setWeekStart(state, { weekStart }) {
    return weekStart === 0 || weekStart === 1 ? { ...state, weekStart } : state;
  },

  setStatus(state, { status }) {
    return STATUSES.includes(status) ? setFilters(state, { status }) : state;
  },

  toggleCategoryFilter(state, { name }) {
    return setFilters(state, { category: state.filters.category === name ? null : name });
  },

  toggleTagFilter(state, { tag }) {
    const normalized = normalizeTag(tag);
    const { tags } = state.filters;
    return setFilters(state, {
      tags: tags.includes(normalized)
        ? tags.filter((t) => t !== normalized)
        : [...tags, normalized],
    });
  },

  toggleDayFilter(state, { date }) {
    if (!isValidISODate(date)) return state;
    return setFilters(state, { day: state.filters.day === date ? null : date });
  },

  setSearch(state, { search }) {
    return state.filters.search === search ? state : setFilters(state, { search });
  },

  clearFilters(state) {
    return { ...state, filters: DEFAULT_FILTERS };
  },
};

export function reduce(state, action) {
  const handler = handlers[action.type];
  if (!handler) throw new Error(`Unknown action: ${action.type}`);
  return handler(state, action);
}

// ---------------------------------------------------------------------------
// Store instance

let current = null;
const listeners = new Set();

export function initStore(initialState) {
  current = initialState;
  listeners.clear();
}

export function getState() {
  return current;
}

export function dispatch(action) {
  const prev = current;
  current = reduce(prev, action);
  if (current !== prev) {
    for (const listener of listeners) listener(current, prev, action);
  }
  return current !== prev;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
