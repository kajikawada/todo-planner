import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_PREFIX, DATA_KEY, UI_KEY, createSaver, load, loadUi, migrate, readData, save, saveUi,
} from '../js/storage.js';
import { CATEGORIES, seed, task } from './helpers/fixtures.js';

const NOW = '2026-09-27T09:00:00.000Z';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    map,
    writes,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes.push(k); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

const EMPTY = { version: 1, tasks: [], categories: ['Work', 'Personal'] };
const seedData = () => ({ version: 1, tasks: [...seed()], categories: [...CATEGORIES] });
const backupKeys = (backend) => [...backend.map.keys()].filter((k) => k.startsWith(BACKUP_PREFIX));

function assertCorrupt(raw) {
  const backend = memoryStorage({ [DATA_KEY]: raw });
  const result = load(backend, { now: NOW });
  assert.deepEqual(result.data, EMPTY);
  assert.equal(result.warning, 'corrupt');
  const [key] = backupKeys(backend);
  assert.ok(key, 'a backup key exists');
  assert.equal(result.backupKey, key);
  assert.equal(backend.getItem(key), raw);
  assert.deepEqual(JSON.parse(backend.getItem(DATA_KEY)), EMPTY);
  return backend;
}

test('SG-01 empty storage loads the first-run state (A-20)', () => {
  const result = load(memoryStorage(), { now: NOW });
  assert.deepEqual(result.data, EMPTY);
  assert.equal(result.warning, null);
});

test('SG-02 save then load round-trips', () => {
  const backend = memoryStorage();
  save(seedData(), backend);
  assert.deepEqual(load(backend, { now: NOW }).data, seedData());
});

test('SG-03 save writes only the data key, with version 1', () => {
  const backend = memoryStorage();
  save(seedData(), backend);
  saveUi({ view: 'list', month: { year: 2026, month: 8 }, sort: 'default', weekStart: 1 }, backend);
  assert.deepEqual([...backend.map.keys()].sort(), [DATA_KEY, UI_KEY].sort());
  assert.equal(JSON.parse(backend.getItem(DATA_KEY)).version, 1);
});

test('SG-04 unparseable JSON is backed up and replaced', () => {
  assertCorrupt('{not json');
});

test('SG-05 JSON with the wrong shape is corrupt', () => {
  for (const raw of ['[]', '{}', '{"version":1,"tasks":{}}', '{"version":1,"tasks":[],"categories":"x"}']) {
    assertCorrupt(raw);
  }
});

test('SG-06 one invalid task makes the payload corrupt (A-19)', () => {
  const data = seedData();
  data.tasks[3] = { ...data.tasks[3], priority: 'urgent' };
  assertCorrupt(JSON.stringify(data));
});

test('SG-07 duplicate task ids are corrupt', () => {
  const data = seedData();
  data.tasks[1] = { ...data.tasks[1], id: data.tasks[0].id };
  assertCorrupt(JSON.stringify(data));
});

test('SG-08 duplicate categories (ignoring case) are corrupt', () => {
  assertCorrupt(JSON.stringify({ version: 1, tasks: [], categories: ['Work', 'work'] }));
});

test('SG-09 a missing version is corrupt', () => {
  assertCorrupt(JSON.stringify({ tasks: [], categories: [] }));
});

test('SG-10 a version newer than the app is corrupt (A-18)', () => {
  assertCorrupt(JSON.stringify({ version: 2, tasks: [], categories: [] }));
});

test('SG-11 two corrupt loads make two distinct backups', () => {
  const backend = memoryStorage({ [DATA_KEY]: '{bad one' });
  load(backend, { now: NOW });
  backend.setItem(DATA_KEY, '{bad two');
  load(backend, { now: NOW });
  const keys = backupKeys(backend);
  assert.equal(keys.length, 2);
  assert.deepEqual(keys.map((k) => backend.getItem(k)).sort(), ['{bad one', '{bad two']);
});

test('SG-12 a full quota is reported, not thrown', () => {
  const backend = memoryStorage();
  backend.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  let result;
  assert.doesNotThrow(() => { result = save(seedData(), backend); });
  assert.deepEqual(result, { ok: false, error: 'quota' });
});

test('SG-13 unavailable storage runs in memory', () => {
  const denied = () => { throw new DOMException('denied', 'SecurityError'); };
  const backend = {
    getItem: denied, setItem: denied, removeItem: denied, key: denied, get length() { return denied(); },
  };
  const result = load(backend, { now: NOW });
  assert.deepEqual(result.data, EMPTY);
  assert.equal(result.warning, 'unavailable');
  assert.doesNotThrow(() => save(seedData(), backend));
  assert.equal(load(null).warning, 'unavailable');
  assert.deepEqual(save(seedData(), null), { ok: false, error: 'unavailable' });
});

test('SG-14 the saver debounces to one write of the last state', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const backend = memoryStorage();
  const saver = createSaver(backend, 200);
  for (let i = 1; i <= 5; i += 1) {
    saver.save({ version: 1, tasks: [], categories: [`C${i}`] });
    t.mock.timers.tick(30);
  }
  assert.equal(backend.writes.length, 0);
  t.mock.timers.tick(169);
  assert.equal(backend.writes.length, 0);
  t.mock.timers.tick(1);
  assert.equal(backend.writes.length, 1);
  assert.deepEqual(JSON.parse(backend.getItem(DATA_KEY)).categories, ['C5']);
});

test('SG-15 flush writes at once, and the timer does not write again', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const backend = memoryStorage();
  const saver = createSaver(backend, 200);
  saver.save(seedData());
  saver.flush();
  assert.equal(backend.writes.length, 1);
  t.mock.timers.tick(500);
  assert.equal(backend.writes.length, 1);
});

test('SG-16 flush with nothing pending writes nothing', () => {
  const backend = memoryStorage();
  createSaver(backend, 200).flush();
  assert.equal(backend.writes.length, 0);
});

test('SG-17 migrate leaves a current payload unchanged', () => {
  const data = seedData();
  assert.equal(migrate(data), data);
});

test('SG-18 migrations run in order and load saves the result', () => {
  const calls = [];
  const registry = {
    1: (d) => { calls.push('1to2'); return { ...d, version: 2 }; },
    2: (d) => { calls.push('2to3'); return { ...d, version: 3 }; },
  };
  const migrated = migrate(seedData(), registry, 3);
  assert.deepEqual(calls, ['1to2', '2to3']);
  assert.equal(migrated.version, 3);

  const backend = memoryStorage({ [DATA_KEY]: JSON.stringify(seedData()) });
  const result = load(backend, { now: NOW, registry, target: 3 });
  assert.equal(result.data.version, 3);
  assert.equal(JSON.parse(backend.getItem(DATA_KEY)).version, 3);
});

test('SG-19 a throwing migration is treated as corrupt', () => {
  const registry = { 1: () => { throw new Error('boom'); } };
  const raw = JSON.stringify(seedData());
  const backend = memoryStorage({ [DATA_KEY]: raw });
  const result = load(backend, { now: NOW, registry, target: 2 });
  assert.equal(result.warning, 'corrupt');
  assert.deepEqual(result.data, EMPTY);
  assert.equal(backend.getItem(result.backupKey), raw);
});

test('SG-20 a bad UI key falls back to defaults without a backup', () => {
  const backend = memoryStorage({ [UI_KEY]: '{bad', [DATA_KEY]: JSON.stringify(seedData()) });
  assert.deepEqual(loadUi(backend), {});
  assert.deepEqual(load(backend, { now: NOW }).data, seedData());
  assert.deepEqual(backupKeys(backend), []);
});

test('SG-20 invalid UI fields fall back one by one', () => {
  const backend = memoryStorage({
    [UI_KEY]: JSON.stringify({ view: 'calendar', month: { year: 2026, month: 12 }, sort: 'x', weekStart: 0 }),
  });
  assert.deepEqual(loadUi(backend), { view: 'calendar', weekStart: 0 });
});

test('SG-21 unrelated keys are never touched', () => {
  const backend = memoryStorage({ 'other-app:x': 'keep', [DATA_KEY]: '{bad' });
  const touched = [];
  const spy = {
    ...backend,
    get length() { return backend.length; },
    getItem: (k) => { touched.push(k); return backend.getItem(k); },
    setItem: (k, v) => { touched.push(k); backend.setItem(k, v); },
    removeItem: (k) => { touched.push(k); backend.removeItem(k); },
  };
  load(spy, { now: NOW });
  save(seedData(), spy);
  loadUi(spy);
  readData(spy);
  assert.ok(touched.every((k) => k.startsWith('todo-planner:')), touched.join());
  assert.equal(backend.getItem('other-app:x'), 'keep');
});

test('SG-22 a corrupt value is kept if its backup cannot be written', () => {
  const backend = memoryStorage({ [DATA_KEY]: '{bad' });
  backend.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  const result = load(backend, { now: NOW });
  assert.equal(result.warning, 'corrupt');
  assert.equal(result.backupKey, null);
  assert.equal(backend.getItem(DATA_KEY), '{bad');
});

test('SG-23 readData returns valid data or null, without side effects', () => {
  const backend = memoryStorage({ [DATA_KEY]: JSON.stringify(seedData()) });
  assert.deepEqual(readData(backend), seedData());
  backend.setItem(DATA_KEY, '{bad');
  backend.writes.length = 0;
  assert.equal(readData(backend), null);
  assert.equal(backend.writes.length, 0);
  assert.equal(readData(memoryStorage()), null);
});

test('SG-24 a task with an extra field makes the payload corrupt', () => {
  const data = seedData();
  data.tasks = [{ ...task(), extra: 1 }];
  assertCorrupt(JSON.stringify(data));
});
