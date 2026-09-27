// Pure helpers for local calendar dates stored as 'YYYY-MM-DD' strings.
// Arithmetic runs on UTC day numbers so DST changes can never shift a day.

const DAY_MS = 86400000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const pad = (n, width = 2) => String(n).padStart(width, '0');
const short = (name) => name.slice(0, 3);

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, monthIndex0) {
  if (monthIndex0 === 1) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIndex0];
}

function parts(str) {
  if (typeof str !== 'string') return null;
  const match = ISO_DATE.exec(str);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month - 1)) return null;
  return { year, month, day };
}

export function isValidISODate(str) {
  return parts(str) !== null;
}

export function toISODate(date) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoDate(year, monthIndex0, day) {
  return `${pad(year, 4)}-${pad(monthIndex0 + 1)}-${pad(day)}`;
}

/** Returns the local calendar date of `now` (a Date). */
export function today(now) {
  return toISODate(now);
}

/** Returns a Date at local midnight (or the first valid time that day), or null. */
export function parseISODate(str) {
  const p = parts(str);
  if (!p) return null;
  const date = new Date(2000, 0, 1, 0, 0, 0, 0);
  date.setFullYear(p.year, p.month - 1, p.day);
  return date;
}

function toDayNumber(str) {
  const p = parts(str);
  return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
}

function fromDayNumber(n) {
  const date = new Date(n * DAY_MS);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Compares two valid dates. Negative if a is earlier, 0 if equal. */
export function compareDates(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function addDays(str, n) {
  return fromDayNumber(toDayNumber(str) + n);
}

/** Whole days from a to b (positive if b is later). */
export function diffDays(a, b) {
  return toDayNumber(b) - toDayNumber(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(str) {
  return new Date(toDayNumber(str) * DAY_MS).getUTCDay();
}

export function formatShort(str) {
  const p = parts(str);
  return `${short(MONTH_NAMES[p.month - 1])} ${p.day}`;
}

/** 'Wed, Sep 30' */
export function formatLong(str) {
  return `${short(WEEKDAY_NAMES[weekday(str)])}, ${formatShort(str)}`;
}

/** 'Wednesday, September 30, 2026' */
export function formatFull(str) {
  const p = parts(str);
  return `${WEEKDAY_NAMES[weekday(str)]}, ${MONTH_NAMES[p.month - 1]} ${p.day}, ${p.year}`;
}

export function formatMonthYear(year, monthIndex0) {
  return `${MONTH_NAMES[monthIndex0]} ${year}`;
}

/** Label for a due date relative to today (see spec §3.2). */
export function relativeLabel(due, todayStr) {
  const diff = diffDays(todayStr, due);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff >= 2 && diff <= 6) return short(WEEKDAY_NAMES[weekday(due)]);
  return formatShort(due);
}

export function monthOf(str) {
  const p = parts(str);
  return { year: p.year, month: p.month - 1 };
}

export function addMonths(year, monthIndex0, n) {
  const total = year * 12 + monthIndex0 + n;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Short weekday names in display order, starting at weekStart (0 = Sun, 1 = Mon). */
export function weekdayHeaders(weekStart) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(weekStart + i) % 7]);
}

/**
 * Rows of 7 cells covering the month with the fewest full weeks (4–6).
 * Each cell is { date, day, inMonth }.
 */
export function monthGrid(year, monthIndex0, weekStart) {
  const first = isoDate(year, monthIndex0, 1);
  const offset = (weekday(first) - weekStart + 7) % 7;
  const start = addDays(first, -offset);
  const cellCount = Math.ceil((offset + daysInMonth(year, monthIndex0)) / 7) * 7;
  const rows = [];
  for (let i = 0; i < cellCount; i += 1) {
    const date = addDays(start, i);
    const p = parts(date);
    if (i % 7 === 0) rows.push([]);
    rows[rows.length - 1].push({
      date,
      day: p.day,
      inMonth: p.year === year && p.month - 1 === monthIndex0,
    });
  }
  return rows;
}
