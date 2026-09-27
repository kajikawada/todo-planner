// The only module that touches localStorage. `backend` is anything with the
// Storage interface; it defaults to window.localStorage.

import { DEFAULT_CATEGORIES, LIMITS, SORT_KEYS, validateTask } from './model.js';

export const DATA_KEY = 'todo-planner:v1';
export const UI_KEY = 'todo-planner:ui';
export const BACKUP_PREFIX = 'todo-planner:backup-';
export const CURRENT_VERSION = 1;

/** migrations[n] turns a version-n payload into version n + 1. */
export const MIGRATIONS = Object.freeze({});

export function emptyData() {
  return { version: CURRENT_VERSION, tasks: [], categories: [...DEFAULT_CATEGORIES] };
}

export function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Runs migrations in order up to `target`. Throws if the payload can't be migrated. */
export function migrate(data, registry = MIGRATIONS, target = CURRENT_VERSION) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Payload is not an object');
  }
  if (!Number.isInteger(data.version) || data.version < 1) throw new Error('Missing version');
  if (data.version > target) throw new Error(`Unsupported version ${data.version}`);
  let result = data;
  while (result.version < target) {
    const step = registry[result.version];
    if (typeof step !== 'function') throw new Error(`No migration from v${result.version}`);
    const next = step(result);
    if (!next || next.version !== result.version + 1) {
      throw new Error(`Migration from v${result.version} returned the wrong version`);
    }
    result = next;
  }
  return result;
}

function validCategories(categories) {
  if (!Array.isArray(categories)) return false;
  const seen = new Set();
  for (const name of categories) {
    if (typeof name !== 'string') return false;
    if (name !== name.trim() || name.length < 1 || name.length > LIMITS.category) return false;
    const lower = name.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
  }
  return true;
}

/** True only if every part of the payload is valid (spec §2.2). */
export function isValidData(data, version = CURRENT_VERSION) {
  if (data === null || typeof data !== 'object') return false;
  if (data.version !== version) return false;
  if (!Array.isArray(data.tasks) || !validCategories(data.categories)) return false;
  const ids = new Set();
  for (const task of data.tasks) {
    if (task === null || typeof task !== 'object' || Array.isArray(task)) return false;
    if (!validateTask(task, data.categories).valid || ids.has(task.id)) return false;
    ids.add(task.id);
  }
  return true;
}

function parseData(raw, registry, target) {
  const migrated = migrate(JSON.parse(raw), registry, target);
  if (!isValidData(migrated, target)) throw new Error('Invalid payload');
  return migrated;
}

function writeBackup(raw, backend, now) {
  const base = `${BACKUP_PREFIX}${now}`;
  let key = base;
  for (let n = 1; backend.getItem(key) !== null; n += 1) key = `${base}-${n}`;
  backend.setItem(key, raw);
  return key;
}

/**
 * Loads task data. Returns { data, warning, backupKey } where warning is
 * null, 'corrupt', 'unavailable', or 'quota' (a migrated payload couldn't be saved).
 */
export function load(backend = defaultBackend(), options = {}) {
  const {
    registry = MIGRATIONS,
    target = CURRENT_VERSION,
    now = new Date().toISOString(),
  } = options;
  if (!backend) return { data: emptyData(), warning: 'unavailable', backupKey: null };

  let raw;
  try {
    raw = backend.getItem(DATA_KEY);
  } catch {
    return { data: emptyData(), warning: 'unavailable', backupKey: null };
  }
  if (raw === null) return { data: emptyData(), warning: null, backupKey: null };

  let data;
  try {
    data = parseData(raw, registry, target);
  } catch {
    let backupKey = null;
    try {
      backupKey = writeBackup(raw, backend, now);
      // Only replace the corrupt value once its backup is safely written.
      save(emptyData(), backend);
    } catch {
      backupKey = null;
    }
    return { data: emptyData(), warning: 'corrupt', backupKey };
  }

  let warning = null;
  if (JSON.parse(raw).version !== data.version) {
    const result = save(data, backend);
    if (!result.ok) warning = result.error;
  }
  return { data, warning, backupKey: null };
}

/** Reads the current data without side effects. Returns null if missing or invalid. */
export function readData(backend = defaultBackend(), registry = MIGRATIONS, target = CURRENT_VERSION) {
  try {
    const raw = backend?.getItem(DATA_KEY);
    return raw == null ? null : parseData(raw, registry, target);
  } catch {
    return null;
  }
}

function writeJson(key, value, backend) {
  if (!backend) return { ok: false, error: 'unavailable' };
  try {
    backend.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError'
      || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error?.code === 22;
    return { ok: false, error: quota ? 'quota' : 'unavailable' };
  }
}

/** Saves task data. Never throws; returns { ok } or { ok: false, error: 'quota' | 'unavailable' }. */
export function save(data, backend = defaultBackend()) {
  return writeJson(DATA_KEY, {
    version: data.version ?? CURRENT_VERSION,
    tasks: data.tasks,
    categories: data.categories,
  }, backend);
}

// ---------------------------------------------------------------------------
// UI state (view, month, sort, week start). Invalid fields fall back silently.

function validMonth(month) {
  return month !== null && typeof month === 'object'
    && Number.isInteger(month.year) && month.year >= 1 && month.year <= 9999
    && Number.isInteger(month.month) && month.month >= 0 && month.month <= 11;
}

export function loadUi(backend = defaultBackend()) {
  let parsed;
  try {
    parsed = JSON.parse(backend?.getItem(UI_KEY) ?? 'null');
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== 'object') return {};
  const ui = {};
  if (parsed.view === 'list' || parsed.view === 'calendar') ui.view = parsed.view;
  if (validMonth(parsed.month)) ui.month = { year: parsed.month.year, month: parsed.month.month };
  if (SORT_KEYS.includes(parsed.sort)) ui.sort = parsed.sort;
  if (parsed.weekStart === 0 || parsed.weekStart === 1) ui.weekStart = parsed.weekStart;
  return ui;
}

export function saveUi(ui, backend = defaultBackend()) {
  return writeJson(UI_KEY, {
    view: ui.view, month: ui.month, sort: ui.sort, weekStart: ui.weekStart,
  }, backend);
}

// ---------------------------------------------------------------------------
// Debounced saving

/**
 * Returns { save(value), flush() }. Writes the latest value `delayMs` after
 * the last call, or immediately on flush(). `onResult` gets each write's result.
 */
export function createSaver(backend = defaultBackend(), delayMs = 200, options = {}) {
  const { write = save, onResult = () => {} } = options;
  let pending = null;
  let hasPending = false;
  let timer = null;

  function flush() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!hasPending) return;
    const value = pending;
    pending = null;
    hasPending = false;
    onResult(write(value, backend));
  }

  return {
    save(value) {
      pending = value;
      hasPending = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
