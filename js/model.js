// Pure task logic: creation, validation, quick-add parsing, filtering,
// sorting, grouping, and sidebar counts. No DOM, storage, or clock access.

import { compareDates, isValidISODate } from './utils/date.js';

export const PRIORITIES = ['high', 'medium', 'low'];
export const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
export const SORT_KEYS = ['default', 'priority', 'created'];
export const STATUSES = ['active', 'completed', 'all'];

export const LIMITS = {
  title: 200,
  notes: 5000,
  tag: 30,
  category: 40,
};

export const DEFAULT_CATEGORIES = Object.freeze(['Work', 'Personal']);

export const DEFAULT_FILTERS = Object.freeze({
  status: 'active',
  category: null,
  tags: Object.freeze([]),
  day: null,
  search: '',
});

const TASK_KEYS = [
  'id', 'title', 'notes', 'dueDate', 'priority', 'category', 'tags',
  'completed', 'createdAt', 'updatedAt', 'completedAt',
];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const TAG_INVALID_CHARS = /[\s,]/;

// ---------------------------------------------------------------------------
// Tags

export function normalizeTag(raw) {
  return String(raw).trim().replace(/^#/, '').toLowerCase();
}

/** Accepts a comma-separated string or an array. Drops empties and duplicates. */
export function normalizeTags(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const seen = new Set();
  const result = [];
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

function isValidTag(tag) {
  return typeof tag === 'string'
    && tag.length >= 1
    && tag.length <= LIMITS.tag
    && !TAG_INVALID_CHARS.test(tag)
    && tag === tag.toLowerCase();
}

// ---------------------------------------------------------------------------
// Create, edit, validate

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

export function createTask(fields, { id, now }) {
  const completed = fields.completed === true;
  return {
    id,
    title: String(fields.title ?? '').trim(),
    notes: fields.notes ?? '',
    dueDate: emptyToNull(fields.dueDate),
    priority: fields.priority ?? 'medium',
    category: emptyToNull(fields.category),
    tags: normalizeTags(fields.tags ?? []),
    completed,
    createdAt: now,
    updatedAt: now,
    completedAt: completed ? (fields.completedAt ?? now) : null,
  };
}

/** Returns a new task with `fields` applied and `updatedAt` bumped. Doesn't validate. */
export function editTask(task, fields, now) {
  const next = { ...task, updatedAt: now };
  if ('title' in fields) next.title = String(fields.title ?? '').trim();
  if ('notes' in fields) next.notes = fields.notes ?? '';
  if ('dueDate' in fields) next.dueDate = emptyToNull(fields.dueDate);
  if ('priority' in fields) next.priority = fields.priority;
  if ('category' in fields) next.category = emptyToNull(fields.category);
  if ('tags' in fields) next.tags = normalizeTags(fields.tags);
  if ('completed' in fields && fields.completed !== task.completed) {
    next.completed = fields.completed === true;
    next.completedAt = next.completed ? now : null;
  }
  return next;
}

export function setCompleted(task, completed, now) {
  return editTask(task, { completed }, now);
}

export function validateTitle(title) {
  if (typeof title !== 'string') return 'Enter a title.';
  const length = title.trim().length;
  if (length === 0) return 'Enter a title.';
  if (length > LIMITS.title) {
    return `Title must be ${LIMITS.title} characters or fewer (now ${length}).`;
  }
  return null;
}

export function validateTask(task, categories) {
  const errors = {};
  const titleError = validateTitle(task.title);
  if (titleError) errors.title = titleError;

  if (typeof task.notes !== 'string') {
    errors.notes = 'Notes must be text.';
  } else if (task.notes.length > LIMITS.notes) {
    errors.notes = `Notes must be ${LIMITS.notes} characters or fewer (now ${task.notes.length}).`;
  }

  if (task.dueDate !== null && !isValidISODate(task.dueDate)) {
    errors.dueDate = 'Enter a real date, or leave it empty.';
  }

  if (!PRIORITIES.includes(task.priority)) {
    errors.priority = 'Choose high, medium, or low.';
  }

  if (task.category !== null && !categories.includes(task.category)) {
    errors.category = 'Choose an existing category.';
  }

  if (!Array.isArray(task.tags)
    || !task.tags.every(isValidTag)
    || new Set(task.tags).size !== task.tags.length) {
    errors.tags = `Each tag must be 1–${LIMITS.tag} characters with no spaces or commas.`;
  }

  if (typeof task.id !== 'string' || task.id === '') errors.id = 'Missing id.';
  if (typeof task.createdAt !== 'string' || !ISO_TIMESTAMP.test(task.createdAt)) {
    errors.createdAt = 'Missing creation time.';
  }
  if (typeof task.updatedAt !== 'string' || !ISO_TIMESTAMP.test(task.updatedAt)) {
    errors.updatedAt = 'Missing update time.';
  }

  const completionOk = task.completed === true
    ? typeof task.completedAt === 'string' && ISO_TIMESTAMP.test(task.completedAt)
    : task.completed === false && task.completedAt === null;
  if (!completionOk) errors.completed = 'Completion state is inconsistent.';

  const keys = Object.keys(task);
  if (keys.length !== TASK_KEYS.length || !TASK_KEYS.every((k) => keys.includes(k))) {
    errors.fields = 'Unexpected task fields.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Categories

/** Returns an error message, or null if `name` can be added (or `from` renamed to it). */
export function validateCategoryName(name, categories, from = null) {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length === 0) return 'Enter a category name.';
  if (trimmed.length > LIMITS.category) {
    return `Category names must be ${LIMITS.category} characters or fewer.`;
  }
  const lower = trimmed.toLowerCase();
  const clash = categories.some((c) => c !== from && c.toLowerCase() === lower);
  if (clash) return `A category named “${trimmed}” already exists.`;
  return null;
}

// ---------------------------------------------------------------------------
// Quick add

// A tag starts with '#' at the start or after whitespace and runs to the
// next whitespace or comma.
const QUICK_TAG = /(?<=^|\s)#([^\s,]+)/g;

export function parseQuickAdd(text) {
  const source = String(text ?? '');
  const segments = [];
  const tags = [];
  let last = 0;
  for (const match of source.matchAll(QUICK_TAG)) {
    if (match[1].length > LIMITS.tag) continue;
    segments.push(source.slice(last, match.index));
    tags.push(match[1]);
    last = match.index + match[0].length;
  }
  segments.push(source.slice(last));

  // Collapse the whitespace around each removed tag to one space, with no
  // space left before a comma. Whitespace elsewhere is kept as typed.
  let title = segments[0];
  for (const segment of segments.slice(1)) {
    const left = title.trimEnd();
    const right = segment.trimStart();
    if (left === '' || right.startsWith(',')) title = left + right;
    else title = `${left} ${right}`;
  }
  return { title: title.trim(), tags: normalizeTags(tags) };
}

/** Fields for a quick-added task: parsed text plus the inherited filters (§3.1). */
export function quickAddFields(text, filters) {
  const { title, tags } = parseQuickAdd(text);
  return {
    title,
    tags: normalizeTags([...tags, ...filters.tags]),
    category: filters.category,
    dueDate: filters.day,
  };
}

// ---------------------------------------------------------------------------
// Due status, filter, sort, group

export function dueStatus(task, todayStr) {
  if (task.completed) return 'completed';
  if (task.dueDate === null) return 'none';
  const cmp = compareDates(task.dueDate, todayStr);
  if (cmp < 0) return 'overdue';
  if (cmp === 0) return 'today';
  return 'upcoming';
}

function matchesStatus(task, status) {
  if (status === 'active') return !task.completed;
  if (status === 'completed') return task.completed;
  return true;
}

function matchesSearch(task, needle) {
  return task.title.toLowerCase().includes(needle)
    || task.notes.toLowerCase().includes(needle)
    || task.tags.some((tag) => tag.includes(needle));
}

export function hasActiveFilters(filters) {
  return filters.status !== 'active'
    || filters.category !== null
    || filters.tags.length > 0
    || filters.day !== null
    || filters.search.trim() !== '';
}

export function filterTasks(tasks, filters) {
  const needle = (filters.search ?? '').trim().toLowerCase();
  const tags = filters.tags ?? [];
  return tasks.filter((task) => matchesStatus(task, filters.status ?? 'all')
    && (filters.category == null || task.category === filters.category)
    && tags.every((tag) => task.tags.includes(tag))
    && (filters.day == null || task.dueDate === filters.day)
    && (needle === '' || matchesSearch(task, needle)));
}

const byCompletion = (a, b) => Number(a.completed) - Number(b.completed);
const byPriority = (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
const byCreatedAsc = (a, b) => compareTimestamps(a.createdAt, b.createdAt);
const byCreatedDesc = (a, b) => compareTimestamps(b.createdAt, a.createdAt);

function compareTimestamps(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function byDueDate(a, b) {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return compareDates(a.dueDate, b.dueDate);
}

const COMPARATORS = {
  default: [byCompletion, byDueDate, byPriority, byCreatedAsc],
  priority: [byCompletion, byPriority, byDueDate, byCreatedAsc],
  created: [byCompletion, byCreatedDesc],
};

/** Returns a new, stably sorted array. */
export function sortTasks(tasks, sortKey = 'default') {
  const comparators = COMPARATORS[sortKey] ?? COMPARATORS.default;
  return [...tasks].sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export const GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'nodate', label: 'No date' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_TO_GROUP = {
  overdue: 'overdue', today: 'today', upcoming: 'upcoming', none: 'nodate', completed: 'completed',
};

export function groupTasks(tasks, todayStr) {
  const buckets = Object.fromEntries(GROUPS.map((g) => [g.key, []]));
  for (const task of tasks) buckets[STATUS_TO_GROUP[dueStatus(task, todayStr)]].push(task);
  return GROUPS
    .filter((g) => buckets[g.key].length > 0)
    .map((g) => ({ key: g.key, label: g.label, tasks: buckets[g.key] }));
}

// ---------------------------------------------------------------------------
// Sidebar counts (active tasks only)

export function countByStatus(tasks) {
  const completed = tasks.filter((t) => t.completed).length;
  return { active: tasks.length - completed, completed, all: tasks.length };
}

export function countByCategory(tasks, categories) {
  const counts = Object.fromEntries(categories.map((c) => [c, 0]));
  for (const task of tasks) {
    if (!task.completed && task.category !== null && Object.hasOwn(counts, task.category)) {
      counts[task.category] += 1;
    }
  }
  return counts;
}

/** Every tag in use, alphabetically, as [{ tag, count }] with active-task counts. */
export function countByTag(tasks) {
  const counts = new Map();
  for (const task of tasks) {
    for (const tag of task.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + (task.completed ? 0 : 1));
    }
  }
  return [...counts.keys()]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((tag) => ({ tag, count: counts.get(tag) }));
}
