import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countByCategory, countByTag, createTask, dueStatus, filterTasks, groupTasks,
  normalizeTags, parseQuickAdd, quickAddFields, sortTasks, validateTask,
} from '../js/model.js';
import {
  BASE_NOW, CATEGORIES, T, deepFreeze, labels, seed, task,
} from './helpers/fixtures.js';

const N = BASE_NOW;
const F = (filters) => deepFreeze({
  status: 'active', category: null, tags: [], day: null, search: '', ...filters,
});
const ids = (tasks) => labels(tasks).join(', ');
const errorsOf = (overrides) => validateTask(task(overrides), CATEGORIES).errors;

// 5.1 createTask

test('MC-01 createTask applies defaults and has exactly 11 keys', () => {
  assert.deepEqual(createTask({ title: 'A' }, { id: 'x', now: N }), {
    id: 'x',
    title: 'A',
    notes: '',
    dueDate: null,
    priority: 'medium',
    category: null,
    tags: [],
    completed: false,
    createdAt: N,
    updatedAt: N,
    completedAt: null,
  });
});

test('MC-02 createTask trims the title', () => {
  assert.equal(createTask({ title: '  Buy milk  ' }, { id: 'x', now: N }).title, 'Buy milk');
});

test('MC-03 createTask normalizes tags', () => {
  const created = createTask({ title: 'A', tags: ['Urgent', ' urgent ', 'Home'] }, { id: 'x', now: N });
  assert.deepEqual(created.tags, ['urgent', 'home']);
});

test('MC-04 createTask keeps every given field', () => {
  const created = createTask({
    title: 'A', notes: 'n', dueDate: T, priority: 'high', category: 'Work', tags: ['x'],
  }, { id: 'x', now: N });
  assert.equal(created.notes, 'n');
  assert.equal(created.dueDate, T);
  assert.equal(created.priority, 'high');
  assert.equal(created.category, 'Work');
  assert.deepEqual(created.tags, ['x']);
  assert.equal(created.createdAt, N);
  assert.equal(created.updatedAt, N);
});

test('MC-05 createTask accepts a frozen input and returns a new object', () => {
  const input = deepFreeze({ title: 'A', tags: ['B'] });
  const created = createTask(input, { id: 'x', now: N });
  assert.notEqual(created, input);
  assert.notEqual(created.tags, input.tags);
});

test('MC-06 createTask drops unknown fields', () => {
  assert.equal('foo' in createTask({ title: 'A', foo: 1 }, { id: 'x', now: N }), false);
});

// 5.2 validateTask

test('MV-01 a valid default task has no errors', () => {
  assert.deepEqual(validateTask(task(), CATEGORIES), { valid: true, errors: {} });
});

test('MV-02 empty title is invalid', () => {
  assert.ok(errorsOf({ title: '' }).title);
});

test('MV-03 whitespace-only title is invalid', () => {
  assert.ok(errorsOf({ title: '   ' }).title);
  assert.ok(errorsOf({ title: '\t\n' }).title);
});

test('MV-04 a 1-character title is valid', () => {
  assert.equal(validateTask(task({ title: 'a' }), CATEGORIES).valid, true);
});

test('MV-05 a 200-character title is valid', () => {
  assert.equal(validateTask(task({ title: 'a'.repeat(200) }), CATEGORIES).valid, true);
});

test('MV-06 a 201-character title is invalid', () => {
  assert.ok(errorsOf({ title: 'a'.repeat(201) }).title);
});

test('MV-07 length is measured after trimming', () => {
  assert.equal(validateTask(task({ title: `  ${'a'.repeat(200)}  ` }), CATEGORIES).valid, true);
});

test('MV-08 emoji and CJK titles are valid', () => {
  assert.equal(validateTask(task({ title: '日本語 ✅' }), CATEGORIES).valid, true);
});

test('MV-09 notes up to 5000 characters', () => {
  assert.equal(validateTask(task({ notes: 'a'.repeat(5000) }), CATEGORIES).valid, true);
  assert.ok(errorsOf({ notes: 'a'.repeat(5001) }).notes);
});

test('MV-10 dueDate null or a real date is valid', () => {
  assert.equal(validateTask(task({ dueDate: null }), CATEGORIES).valid, true);
  assert.equal(validateTask(task({ dueDate: T }), CATEGORIES).valid, true);
});

test('MV-11 invalid dueDate values', () => {
  for (const dueDate of ['2026-02-30', '2026-9-7', '', 'tomorrow']) {
    assert.ok(errorsOf({ dueDate }).dueDate, dueDate);
  }
});

test('MV-12 each priority is valid', () => {
  for (const priority of ['high', 'medium', 'low']) {
    assert.equal(validateTask(task({ priority }), CATEGORIES).valid, true, priority);
  }
});

test('MV-13 unknown priorities are invalid', () => {
  for (const priority of ['urgent', 'HIGH', null]) assert.ok(errorsOf({ priority }).priority);
});

test('MV-14 category null or an existing one is valid', () => {
  assert.equal(validateTask(task({ category: null }), CATEGORIES).valid, true);
  assert.equal(validateTask(task({ category: 'Work' }), CATEGORIES).valid, true);
});

test('MV-15 unknown category is invalid', () => {
  assert.ok(errorsOf({ category: 'Unknown' }).category);
});

test('MV-16 category match is case-sensitive', () => {
  assert.ok(errorsOf({ category: 'work' }).category);
});

test('MV-17 tags up to 30 characters', () => {
  assert.equal(validateTask(task({ tags: ['a'.repeat(30)] }), CATEGORIES).valid, true);
  assert.ok(errorsOf({ tags: ['a'.repeat(31)] }).tags);
});

test('MV-18 stored tags must be unique and lowercase', () => {
  assert.ok(errorsOf({ tags: ['a', 'a'] }).tags);
  assert.ok(errorsOf({ tags: ['A'] }).tags);
});

test('MV-19 tags may not contain whitespace', () => {
  assert.ok(errorsOf({ tags: ['to do'] }).tags);
});

test('MV-20 every invalid field is reported', () => {
  const errors = errorsOf({ title: '', notes: 'a'.repeat(5001), priority: 'x', tags: ['A'] });
  assert.deepEqual(Object.keys(errors).sort(), ['notes', 'priority', 'tags', 'title']);
});

test('MV-21 completed and completedAt must agree', () => {
  assert.equal(validateTask(task({ completed: true, completedAt: null }), CATEGORIES).valid, false);
  assert.equal(validateTask(task({ completed: false, completedAt: N }), CATEGORIES).valid, false);
  assert.equal(validateTask(task({ completed: true, completedAt: N }), CATEGORIES).valid, true);
});

test('MV-22 id must be a string and createdAt must exist', () => {
  assert.equal(validateTask(task({ id: 1 }), CATEGORIES).valid, false);
  const { createdAt, ...rest } = task();
  assert.equal(validateTask(rest, CATEGORIES).valid, false);
});

// 5.3 normalizeTags

test('MV-30 normalizeTags trims, lowercases, drops empties and duplicates', () => {
  assert.deepEqual(normalizeTags('Urgent, urgent ,  , billing'), ['urgent', 'billing']);
});

test('MV-31 normalizeTags of empty input', () => {
  assert.deepEqual(normalizeTags(''), []);
  assert.deepEqual(normalizeTags(' , , '), []);
});

test('MV-32 normalizeTags drops a leading #', () => {
  assert.deepEqual(normalizeTags('#urgent, #Home'), ['urgent', 'home']);
});

test('MV-33 normalizeTags lowercases Unicode', () => {
  assert.deepEqual(normalizeTags('ÉTÉ, été'), ['été']);
});

// 5.4 parseQuickAdd

const QUICK_ADD = [
  ['MQ-01', 'Buy milk', 'Buy milk', []],
  ['MQ-02', 'Buy milk #errand', 'Buy milk', ['errand']],
  ['MQ-03', 'Buy #errand milk', 'Buy milk', ['errand']],
  ['MQ-04', '#errand Buy milk', 'Buy milk', ['errand']],
  ['MQ-05', 'Plan #Travel #URGENT trip', 'Plan trip', ['travel', 'urgent']],
  ['MQ-06', 'x #a #A #a', 'x', ['a']],
  ['MQ-07', '#errand', '', ['errand']],
  ['MQ-08', '   ', '', []],
  ['MQ-08', '', '', []],
  ['MQ-09', 'Learn C#', 'Learn C#', []],
  ['MQ-10', 'Price # 5', 'Price # 5', []],
  ['MQ-11', 'Email a@b.com', 'Email a@b.com', []],
  ['MQ-12', 'Call #mom, today', 'Call, today', ['mom']],
  ['MQ-13', `Task #${'a'.repeat(30)}`, 'Task', ['a'.repeat(30)]],
  ['MQ-14', `Task #${'a'.repeat(31)}`, `Task #${'a'.repeat(31)}`, []],
  ['MQ-15', '  Lots   of   space  ', 'Lots   of   space', []],
  ['MQ-16', 'Tag #日本語', 'Tag', ['日本語']],
];

for (const [id, input, title, tags] of QUICK_ADD) {
  test(`${id} parseQuickAdd(${JSON.stringify(input.length > 40 ? `${input.slice(0, 40)}…` : input)})`, () => {
    assert.deepEqual(parseQuickAdd(input), { title, tags });
  });
}

test('MQ-17 quickAddFields inherits category, all tags, and day but not search or status (A-16)', () => {
  const fields = quickAddFields('Pack #bags', F({
    status: 'completed', category: 'Work', tags: ['travel', 'urgent'], day: T, search: 'zzz',
  }));
  assert.deepEqual(fields, {
    title: 'Pack', tags: ['bags', 'travel', 'urgent'], category: 'Work', dueDate: T,
  });
});

// 5.5 dueStatus

test('MD-01 due today', () => {
  assert.equal(dueStatus(task({ dueDate: '2026-09-26' }), '2026-09-26'), 'today');
});

test('MD-02 overdue exactly at midnight', () => {
  assert.equal(dueStatus(task({ dueDate: '2026-09-26' }), '2026-09-27'), 'overdue');
});

test('MD-03 due today (T)', () => {
  assert.equal(dueStatus(task({ dueDate: T }), T), 'today');
});

test('MD-04 upcoming', () => {
  assert.equal(dueStatus(task({ dueDate: '2026-09-28' }), T), 'upcoming');
});

test('MD-05 no due date', () => {
  assert.equal(dueStatus(task(), T), 'none');
});

test('MD-06 completed tasks are never overdue', () => {
  assert.equal(dueStatus(task({ dueDate: '2026-09-20', completed: true, completedAt: N }), T), 'completed');
});

test('MD-07 overdue across the year boundary', () => {
  assert.equal(dueStatus(task({ dueDate: '2026-12-31' }), '2027-01-01'), 'overdue');
});

test('MD-08 overdue across the end of February', () => {
  assert.equal(dueStatus(task({ dueDate: '2026-02-28' }), '2026-03-01'), 'overdue');
});

// 5.6 filterTasks

const FILTER_CASES = [
  ['MF-01', {}, 'S1, S2, S3, S4, S5, S6, S8, S9, S10'],
  ['MF-02', { status: 'completed' }, 'S7'],
  ['MF-03', { status: 'all' }, 'S1, S2, S3, S4, S5, S6, S7, S8, S9, S10'],
  ['MF-04', { category: 'Work' }, 'S1, S2, S9'],
  ['MF-05', { tags: ['travel'] }, 'S4, S5'],
  ['MF-06', { tags: ['travel', 'urgent'] }, 'S4'],
  ['MF-07', { tags: ['travel', 'nosuchtag'] }, ''],
  ['MF-08', { day: T }, 'S2, S9, S10'],
  ['MF-09', { search: 'INVOICE' }, 'S1'],
  ['MF-10', { search: 'organic' }, 'S8'],
  ['MF-11', { search: 'trav' }, 'S4, S5'],
  ['MF-12', { search: 'bill', status: 'all' }, 'S1, S7'],
  ['MF-13', { category: 'Work', tags: ['urgent'] }, 'S9'],
  ['MF-14', { category: 'Work', tags: ['urgent'], search: 'standup' }, ''],
  ['MF-15', { status: 'completed', category: 'Personal' }, 'S7'],
  ['MF-16', { day: '2026-09-25', category: 'Personal' }, ''],
  ['MF-17', { search: '  invoice  ' }, 'S1'],
];

for (const [id, filters, expected] of FILTER_CASES) {
  test(`${id} filterTasks ${JSON.stringify(filters)}`, () => {
    assert.equal(ids(filterTasks(seed(), F(filters))), expected);
  });
}

test('MF-18 whitespace-only search is no search', () => {
  assert.deepEqual(filterTasks(seed(), F({ search: '   ' })), filterTasks(seed(), F()));
});

test('MF-19 search is literal, not a regular expression', () => {
  const tasks = deepFreeze([
    task({ id: 'a', title: 'learn c++' }),
    task({ id: 'b', title: 'call (home)' }),
    task({ id: 'c', title: 'use .* here' }),
    task({ id: 'd', title: 'plain' }),
  ]);
  const titles = (search) => filterTasks(tasks, F({ search })).map((t) => t.id);
  assert.deepEqual(titles('c++'), ['a']);
  assert.deepEqual(titles('('), ['b']);
  assert.deepEqual(titles('.*'), ['c']);
});

test('MF-20 search folds case with toLowerCase', () => {
  assert.equal(filterTasks([task({ title: 'été' })], F({ search: 'ÉTÉ' })).length, 1);
});

test('MF-21 filterTasks accepts frozen input, returns a new array, keeps order', () => {
  const tasks = seed();
  const result = filterTasks(tasks, F({ status: 'all' }));
  assert.notEqual(result, tasks);
  assert.deepEqual(result, [...tasks]);
});

test('MF-22 filterTasks handles 10,000 tasks quickly', () => {
  const many = Array.from({ length: 10000 }, (_, i) => task({
    id: String(i), title: `Task ${i}`, tags: i % 2 ? ['odd'] : [],
  }));
  const start = performance.now();
  filterTasks(many, F({ tags: ['odd'], search: 'task 9' }));
  assert.ok(performance.now() - start < 50);
});

// 5.7 sortTasks

test('MS-01 incomplete before completed', () => {
  const done = task({ id: 'done', dueDate: '2026-09-22', completed: true, completedAt: N });
  const open = task({ id: 'open', dueDate: '2026-10-07' });
  assert.deepEqual(sortTasks([done, open]).map((t) => t.id), ['open', 'done']);
});

test('MS-02 due date ascending, no date last', () => {
  const input = ['2026-09-30', '2026-09-25', null, T].map((dueDate, i) => task({ id: String(i), dueDate }));
  assert.deepEqual(sortTasks(input).map((t) => t.dueDate), ['2026-09-25', T, '2026-09-30', null]);
});

test('MS-03 priority high to low on the same date', () => {
  const input = ['low', 'high', 'medium'].map((priority) => task({ id: priority, dueDate: T, priority }));
  assert.deepEqual(sortTasks(input).map((t) => t.id), ['high', 'medium', 'low']);
});

test('MS-04 createdAt ascending as the last key', () => {
  const nine = task({ id: 'nine', dueDate: T, createdAt: '2026-09-27T09:00:00.000Z' });
  const eight = task({ id: 'eight', dueDate: T, createdAt: '2026-09-27T08:00:00.000Z' });
  assert.deepEqual(sortTasks([nine, eight]).map((t) => t.id), ['eight', 'nine']);
});

test('MS-05 no-date tasks still sort by priority', () => {
  const input = [task({ id: 'low', priority: 'low' }), task({ id: 'high', priority: 'high' })];
  assert.deepEqual(sortTasks(input).map((t) => t.id), ['high', 'low']);
});

test('MS-06 the seed in default order', () => {
  assert.equal(ids(sortTasks(seed(), 'default')), 'S1, S9, S2, S10, S3, S4, S5, S8, S6, S7');
});

test('MS-07 sort is stable', () => {
  const a = task({ id: 'a' });
  const b = task({ id: 'b' });
  for (const key of ['default', 'priority', 'created']) {
    assert.deepEqual(sortTasks([a, b], key).map((t) => t.id), ['a', 'b']);
    assert.deepEqual(sortTasks([b, a], key).map((t) => t.id), ['b', 'a']);
  }
});

test('MS-08 completed tasks sort by due date among themselves', () => {
  const done = (id, dueDate) => task({ id, dueDate, completed: true, completedAt: N });
  const input = [done('late', '2026-09-30'), done('early', '2026-09-20'), done('none', null)];
  assert.deepEqual(sortTasks(input).map((t) => t.id), ['early', 'late', 'none']);
});

test('MS-09 the seed in priority order', () => {
  assert.equal(ids(sortTasks(seed(), 'priority')), 'S1, S9, S5, S2, S10, S4, S8, S3, S6, S7');
});

test('MS-10 the seed in created order', () => {
  assert.equal(ids(sortTasks(seed(), 'created')), 'S10, S9, S8, S6, S5, S4, S3, S2, S1, S7');
});

test('MS-11 sortTasks accepts frozen input and returns a new array', () => {
  const tasks = seed();
  const before = ids(tasks);
  const result = sortTasks(tasks);
  assert.notEqual(result, tasks);
  assert.equal(ids(tasks), before);
});

test('MS-12 date comparison is not numeric-naive', () => {
  const input = [task({ id: 'oct', dueDate: '2026-10-01' }), task({ id: 'sep', dueDate: '2026-09-30' })];
  assert.deepEqual(sortTasks(input).map((t) => t.id), ['sep', 'oct']);
});

// 5.8 groupTasks

const groupSummary = (groups) => groups.map((g) => `${g.key} [${ids(g.tasks)}]`);

test('MG-01 the seed (active) grouped by due status', () => {
  const active = sortTasks(filterTasks(seed(), F()));
  assert.deepEqual(groupSummary(groupTasks(active, T)), [
    'overdue [S1]', 'today [S9, S2, S10]', 'upcoming [S3, S4, S5]', 'nodate [S8, S6]',
  ]);
});

test('MG-02 the seed (all) adds a completed group last', () => {
  const all = sortTasks(filterTasks(seed(), F({ status: 'all' })));
  assert.deepEqual(groupSummary(groupTasks(all, T)), [
    'overdue [S1]', 'today [S9, S2, S10]', 'upcoming [S3, S4, S5]', 'nodate [S8, S6]', 'completed [S7]',
  ]);
});

test('MG-03 a completed overdue task is in completed', () => {
  const done = task({ dueDate: '2026-09-22', completed: true, completedAt: N });
  assert.deepEqual(groupTasks([done], T).map((g) => g.key), ['completed']);
});

test('MG-04 only no-date tasks give a single group', () => {
  assert.deepEqual(groupTasks([task(), task({ id: 'b' })], T).map((g) => g.key), ['nodate']);
});

test('MG-05 no tasks gives no groups', () => {
  assert.deepEqual(groupTasks([], T), []);
});

test('MG-06 a task moves from today to overdue as the day changes', () => {
  const t = task({ dueDate: '2026-09-26' });
  assert.equal(groupTasks([t], '2026-09-26')[0].key, 'today');
  assert.equal(groupTasks([t], T)[0].key, 'overdue');
});

test('MG-07 order within a group matches the input', () => {
  const input = [task({ id: 'b', dueDate: T }), task({ id: 'a', dueDate: T })];
  assert.deepEqual(groupTasks(input, T)[0].tasks.map((t) => t.id), ['b', 'a']);
});

test('MG-08 group labels', () => {
  const done = task({ id: 'e', completed: true, completedAt: N });
  const input = [
    task({ id: 'a', dueDate: '2026-09-20' }), task({ id: 'b', dueDate: T }),
    task({ id: 'c', dueDate: '2026-10-20' }), task({ id: 'd' }), done,
  ];
  assert.deepEqual(groupTasks(input, T).map((g) => g.label),
    ['Overdue', 'Today', 'Upcoming', 'No date', 'Completed']);
});

// 5.9 Sidebar counts

test('MG-10 active counts per category', () => {
  assert.deepEqual(countByCategory(seed(), CATEGORIES), { Work: 3, Personal: 3 });
});

test('MG-11 active counts per tag, alphabetically', () => {
  assert.deepEqual(countByTag(seed()), [
    { tag: 'billing', count: 1 },
    { tag: 'errand', count: 1 },
    { tag: 'travel', count: 2 },
    { tag: 'urgent', count: 2 },
  ]);
});

test('MG-12 a tag used only by completed tasks has count 0', () => {
  const done = task({ tags: ['old'], completed: true, completedAt: N });
  assert.deepEqual(countByTag([done]), [{ tag: 'old', count: 0 }]);
});

test('MG-13 no tasks: no tags and zero category counts', () => {
  assert.deepEqual(countByTag([]), []);
  assert.deepEqual(countByCategory([], CATEGORIES), { Work: 0, Personal: 0 });
});
