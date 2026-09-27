import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce } from '../js/store.js';
import { CATEGORIES, T, deepFreeze, labels, seed, sid } from './helpers/fixtures.js';

const N2 = '2026-09-27T10:00:00.000Z';
const N3 = '2026-09-27T11:00:00.000Z';

function state(overrides = {}) {
  return deepFreeze({
    ...createInitialState({ data: { tasks: seed(), categories: [...CATEGORIES] }, today: T }),
    ...overrides,
  });
}

/** Deep-freezes the previous state, then reduces, so any mutation throws (ST-23). */
const run = (prev, action) => reduce(deepFreeze(prev), action);
const find = (s, n) => s.tasks.find((t) => t.id === sid(n));

test('ST-01 addTask appends a new task without changing the old state', () => {
  const prev = state();
  const next = run(prev, { type: 'addTask', fields: { title: 'New' }, id: 'new-id', now: N2 });
  assert.equal(next.tasks.length, 11);
  assert.equal(next.tasks.at(-1).title, 'New');
  assert.equal(prev.tasks.length, 10);
  assert.notEqual(next.tasks, prev.tasks);
});

test('ST-02 addTask with an empty or whitespace title does nothing', () => {
  const prev = state();
  for (const title of ['', '   ']) {
    assert.equal(run(prev, { type: 'addTask', fields: { title }, id: 'x', now: N2 }), prev);
  }
});

test('ST-03 updateTask changes fields and bumps updatedAt only', () => {
  const next = run(state(), { type: 'updateTask', id: sid(4), fields: { title: 'Plan Japan trip' }, now: N2 });
  const before = find(state(), 4);
  const after = find(next, 4);
  assert.equal(after.title, 'Plan Japan trip');
  assert.equal(after.updatedAt, N2);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.id, before.id);
});

test('ST-04 updateTask with an invalid field leaves state unchanged', () => {
  const prev = state();
  assert.equal(run(prev, { type: 'updateTask', id: sid(4), fields: { title: '' }, now: N2 }), prev);
  assert.equal(run(prev, { type: 'updateTask', id: sid(4), fields: { category: 'Nope' }, now: N2 }), prev);
});

test('ST-05 toggleComplete completes an active task', () => {
  const after = find(run(state(), { type: 'toggleComplete', id: sid(1), now: N2 }), 1);
  assert.equal(after.completed, true);
  assert.equal(after.completedAt, N2);
  assert.equal(after.updatedAt, N2);
});

test('ST-06 toggleComplete again reopens it', () => {
  const once = run(state(), { type: 'toggleComplete', id: sid(1), now: N2 });
  const after = find(run(once, { type: 'toggleComplete', id: sid(1), now: N3 }), 1);
  assert.equal(after.completed, false);
  assert.equal(after.completedAt, null);
  assert.equal(after.updatedAt, N3);
});

test('ST-07 deleteTask removes the task and keeps the others in order', () => {
  const next = run(state(), { type: 'deleteTask', id: sid(4) });
  assert.deepEqual(labels(next.tasks), ['S1', 'S2', 'S3', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
});

test('ST-08 undoDelete restores the task exactly, in place', () => {
  const prev = state();
  const deleted = run(prev, { type: 'deleteTask', id: sid(4) });
  const restored = run(deleted, { type: 'undoDelete' });
  assert.deepEqual(restored.tasks, prev.tasks);
  assert.equal(restored.lastDeleted, null);
});

test('ST-09 only the most recent deletion can be undone (A-17)', () => {
  let s = run(state(), { type: 'deleteTask', id: sid(4) });
  s = run(s, { type: 'deleteTask', id: sid(5) });
  s = run(s, { type: 'undoDelete' });
  assert.ok(find(s, 5));
  assert.equal(find(s, 4), undefined);
  assert.equal(run(s, { type: 'undoDelete' }), s);
});

test('ST-10 addCategory appends', () => {
  assert.deepEqual(run(state(), { type: 'addCategory', name: 'Errands' }).categories,
    ['Work', 'Personal', 'Errands']);
});

test('ST-11 addCategory rejects a case-insensitive duplicate', () => {
  const prev = state();
  assert.equal(run(prev, { type: 'addCategory', name: 'work' }), prev);
});

test('ST-12 addCategory rejects empty and too-long names', () => {
  const prev = state();
  for (const name of ['', '   ', 'a'.repeat(41)]) {
    assert.equal(run(prev, { type: 'addCategory', name }), prev);
  }
});

test('ST-13 addCategory accepts 40 characters and trims', () => {
  assert.equal(run(state(), { type: 'addCategory', name: 'a'.repeat(40) }).categories.length, 3);
  assert.equal(run(state(), { type: 'addCategory', name: '  Errands  ' }).categories[2], 'Errands');
});

test('ST-14 renameCategory renames in place and updates its tasks', () => {
  const next = run(state(), { type: 'renameCategory', from: 'Work', to: 'Office', now: N2 });
  assert.deepEqual(next.categories, ['Office', 'Personal']);
  for (const n of [1, 2, 9]) {
    assert.equal(find(next, n).category, 'Office');
    assert.equal(find(next, n).updatedAt, N2);
  }
  assert.equal(find(next, 3).updatedAt, find(state(), 3).updatedAt);
});

test('ST-15 renameCategory rejects a case-insensitive duplicate', () => {
  const prev = state();
  assert.equal(run(prev, { type: 'renameCategory', from: 'Work', to: 'personal', now: N2 }), prev);
});

test('ST-16 renameCategory to a different case of its own name', () => {
  const next = run(state(), { type: 'renameCategory', from: 'Work', to: 'WORK', now: N2 });
  assert.deepEqual(next.categories, ['WORK', 'Personal']);
  assert.equal(find(next, 1).category, 'WORK');
});

test('ST-17 deleteCategory keeps its tasks with no category', () => {
  const next = run(state(), { type: 'deleteCategory', name: 'Work', now: N2 });
  assert.deepEqual(next.categories, ['Personal']);
  assert.equal(next.tasks.length, 10);
  for (const n of [1, 2, 9]) assert.equal(find(next, n).category, null);
});

test('ST-18 deleting the filtered category clears the filter', () => {
  const filtered = run(state(), { type: 'toggleCategoryFilter', name: 'Work' });
  const next = run(filtered, { type: 'deleteCategory', name: 'Work', now: N2 });
  assert.equal(next.filters.category, null);
});

test('ST-19 renaming the filtered category moves the filter', () => {
  const filtered = run(state(), { type: 'toggleCategoryFilter', name: 'Work' });
  const next = run(filtered, { type: 'renameCategory', from: 'Work', to: 'Office', now: N2 });
  assert.equal(next.filters.category, 'Office');
});

test('ST-20 filter actions change only UI state', () => {
  const prev = state();
  const actions = [
    { type: 'setStatus', status: 'all' },
    { type: 'toggleCategoryFilter', name: 'Work' },
    { type: 'toggleTagFilter', tag: 'urgent' },
    { type: 'toggleDayFilter', date: T },
    { type: 'setSearch', search: 'x' },
  ];
  for (const action of actions) {
    const next = run(prev, action);
    assert.notEqual(next.filters, prev.filters, action.type);
    assert.equal(next.tasks, prev.tasks, action.type);
    assert.equal(next.categories, prev.categories, action.type);
  }
});

test('ST-21 toggling a tag filter twice adds then removes it', () => {
  const once = run(state(), { type: 'toggleTagFilter', tag: 'travel' });
  assert.deepEqual(once.filters.tags, ['travel']);
  assert.deepEqual(run(once, { type: 'toggleTagFilter', tag: 'travel' }).filters.tags, []);
});

test('ST-22 clearFilters resets every filter', () => {
  let s = state();
  s = run(s, { type: 'setStatus', status: 'completed' });
  s = run(s, { type: 'toggleCategoryFilter', name: 'Work' });
  s = run(s, { type: 'toggleTagFilter', tag: 'urgent' });
  s = run(s, { type: 'toggleDayFilter', date: T });
  s = run(s, { type: 'setSearch', search: 'abc' });
  assert.deepEqual(run(s, { type: 'clearFilters' }).filters,
    { status: 'active', category: null, tags: [], day: null, search: '' });
});

test('ST-23 no action mutates a frozen state', () => {
  const actions = [
    { type: 'addTask', fields: { title: 'A', tags: ['x'] }, id: 'a', now: N2 },
    { type: 'updateTask', id: sid(1), fields: { tags: 'a, b' }, now: N2 },
    { type: 'toggleComplete', id: sid(1), now: N2 },
    { type: 'deleteTask', id: sid(1) },
    { type: 'undoDelete' },
    { type: 'commitDelete' },
    { type: 'addCategory', name: 'Errands' },
    { type: 'renameCategory', from: 'Work', to: 'Office', now: N2 },
    { type: 'deleteCategory', name: 'Work', now: N2 },
    { type: 'replaceData', data: { version: 1, tasks: [], categories: [] } },
    { type: 'setToday', today: '2026-09-28' },
    { type: 'setView', view: 'calendar' },
    { type: 'setMonth', year: 2026, month: 9 },
    { type: 'setSort', sort: 'priority' },
    { type: 'setWeekStart', weekStart: 0 },
    { type: 'setStatus', status: 'all' },
    { type: 'toggleCategoryFilter', name: 'Work' },
    { type: 'toggleTagFilter', tag: 'x' },
    { type: 'toggleDayFilter', date: T },
    { type: 'setSearch', search: 'q' },
    { type: 'clearFilters' },
  ];
  let s = state();
  for (const action of actions) {
    assert.doesNotThrow(() => { s = run(s, action); }, action.type);
  }
});

test('ST-24 undoDelete puts a deleted last task back at the end', () => {
  const deleted = run(state(), { type: 'deleteTask', id: sid(10) });
  assert.deepEqual(run(deleted, { type: 'undoDelete' }).tasks, state().tasks);
});

test('ST-25 replaceData from another tab clears a filter on a vanished category', () => {
  const filtered = run(state(), { type: 'toggleCategoryFilter', name: 'Work' });
  const next = run(filtered, { type: 'replaceData', data: { version: 1, tasks: [], categories: ['Personal'] } });
  assert.equal(next.filters.category, null);
  assert.deepEqual(next.categories, ['Personal']);
});
