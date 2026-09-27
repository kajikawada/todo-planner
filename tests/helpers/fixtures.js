// Shared test fixtures (docs/test-case.md §3).

export const T = '2026-09-27';
export const BASE_NOW = '2026-09-27T09:00:00.000Z';
export const CATEGORIES = Object.freeze(['Work', 'Personal']);

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export function task(overrides = {}) {
  return deepFreeze({
    id: overrides.id ?? '00000000-0000-4000-8000-000000000001',
    title: 'Task',
    notes: '',
    dueDate: null,
    priority: 'medium',
    category: null,
    tags: [],
    completed: false,
    createdAt: BASE_NOW,
    updatedAt: BASE_NOW,
    completedAt: null,
    ...overrides,
  });
}

const SEED_DATES = {
  '-5': '2026-09-22',
  '-2': '2026-09-25',
  0: '2026-09-27',
  1: '2026-09-28',
  3: '2026-09-30',
  10: '2026-10-07',
};

function seedTask(i, title, off, priority, category, tags, extra = {}) {
  const ts = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 60000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title,
    notes: '',
    dueDate: off === null ? null : SEED_DATES[off],
    priority,
    category,
    tags,
    completed: false,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    ...extra,
  };
}

/** The S1–S10 seed from §3.2 with T = 2026-09-27. */
export function seed() {
  return deepFreeze([
    seedTask(1, 'Send invoice', -2, 'high', 'Work', ['billing']),
    seedTask(2, 'Team standup notes', 0, 'medium', 'Work', []),
    seedTask(3, 'Book dentist', 1, 'low', 'Personal', []),
    seedTask(4, 'Plan trip', 3, 'medium', 'Personal', ['travel', 'urgent']),
    seedTask(5, 'Renew passport', 10, 'high', null, ['travel']),
    seedTask(6, 'Read book', null, 'low', 'Personal', []),
    seedTask(7, 'Pay rent', -5, 'high', 'Personal', ['billing'],
      { completed: true, completedAt: '2026-01-02T00:00:00.000Z' }),
    seedTask(8, 'Buy milk', null, 'medium', null, ['errand'], { notes: '2 liters, organic' }),
    seedTask(9, 'Fix bug', 0, 'high', 'Work', ['urgent']),
    seedTask(10, 'Water plants', 0, 'medium', null, []),
  ]);
}

/** 'S4' → the seed task's id. */
export const sid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Maps tasks back to 'S<n>' labels for readable assertions. */
export const labels = (tasks) => tasks.map((t) => `S${Number(t.id.slice(-12))}`);
