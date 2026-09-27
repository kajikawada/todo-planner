import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, compareDates, daysInMonth, diffDays, formatShort, isValidISODate, isoDate,
  monthGrid, parseISODate, relativeLabel, toISODate, weekday,
} from '../js/utils/date.js';
import { T } from './helpers/fixtures.js';

/** Runs fn with process.env.TZ set to tz (Node applies TZ changes at runtime). */
function inTimeZone(tz, fn) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

function everyDay(year) {
  const days = [];
  for (let m = 0; m < 12; m += 1) {
    for (let d = 1; d <= daysInMonth(year, m); d += 1) days.push(isoDate(year, m, d));
  }
  return days;
}

// 4.1 Today and parsing

test('DT-01 toISODate at local midnight', () => {
  assert.equal(toISODate(new Date(2026, 8, 27, 0, 0, 0, 0)), '2026-09-27');
});

test('DT-02 toISODate at the last millisecond of the day', () => {
  assert.equal(toISODate(new Date(2026, 8, 27, 23, 59, 59, 999)), '2026-09-27');
});

test('DT-03 toISODate zero-pads month and day', () => {
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
});

test('DT-04 parseISODate returns the local date, not UTC', () => {
  const date = parseISODate('2026-09-27');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 27);
});

test('DT-05 parseISODate/toISODate round-trip for every day of 2026 and 2028', () => {
  for (const s of [...everyDay(2026), ...everyDay(2028)]) {
    assert.equal(toISODate(parseISODate(s)), s);
  }
});

test('DT-05 round trip also holds in America/Santiago', () => {
  inTimeZone('America/Santiago', () => {
    for (const s of [...everyDay(2026), ...everyDay(2028)]) {
      assert.equal(toISODate(parseISODate(s)), s);
    }
  });
});

test('DT-06 isValidISODate accepts real dates, including leap days', () => {
  for (const s of ['2026-09-27', '2028-02-29', '2000-02-29']) assert.equal(isValidISODate(s), true, s);
});

const IMPOSSIBLE = ['2026-02-29', '1900-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-09-00'];
const MALFORMED = ['2026-9-7', '26-09-27', '2026/09/27', '2026-09-27T00:00', ' 2026-09-27', '', null, undefined, 20260927];

test('DT-07 isValidISODate rejects impossible dates', () => {
  for (const s of IMPOSSIBLE) assert.equal(isValidISODate(s), false, s);
});

test('DT-08 isValidISODate rejects malformed input', () => {
  for (const s of MALFORMED) assert.equal(isValidISODate(s), false, String(s));
});

test('DT-09 parseISODate returns null for invalid input without throwing', () => {
  for (const s of [...IMPOSSIBLE, ...MALFORMED]) assert.equal(parseISODate(s), null, String(s));
});

// 4.2 Arithmetic and comparison

test('DT-10 compareDates orders dates', () => {
  assert.ok(compareDates('2026-09-27', '2026-10-01') < 0);
  assert.ok(compareDates('2026-10-01', '2026-09-27') > 0);
  assert.equal(compareDates('2026-09-27', '2026-09-27'), 0);
});

test('DT-11 compareDates across a month boundary', () => {
  assert.ok(compareDates('2026-09-30', '2026-10-01') < 0);
});

test('DT-12 addDays crosses into the next year', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('DT-13 addDays crosses into the previous year', () => {
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
});

test('DT-14 addDays around February in leap and common years', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('DT-15 addDays across DST changes in America/New_York', () => {
  inTimeZone('America/New_York', () => {
    assert.equal(addDays('2026-03-07', 1), '2026-03-08');
    assert.equal(addDays('2026-03-08', 1), '2026-03-09');
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  });
});

test('DT-16 addDays by 0 and by 365', () => {
  assert.equal(addDays('2026-09-27', 0), '2026-09-27');
  assert.equal(addDays('2026-09-27', 365), '2027-09-27');
});

test('DT-17 diffDays counts whole days', () => {
  assert.equal(diffDays('2026-09-27', '2026-10-04'), 7);
});

test('DT-18 diffDays is an exact integer across DST in America/New_York', () => {
  inTimeZone('America/New_York', () => {
    assert.equal(diffDays('2026-03-01', '2026-03-15'), 14);
    assert.equal(diffDays('2026-10-25', '2026-11-08'), 14);
  });
});

test('DT-19 diffDays is negative for an earlier date', () => {
  assert.equal(diffDays('2026-09-27', '2026-09-25'), -2);
});

// 4.3 Labels and formatting

test('DT-20 relativeLabel for today', () => {
  assert.equal(relativeLabel(T, T), 'Today');
});

test('DT-21 relativeLabel for tomorrow', () => {
  assert.equal(relativeLabel('2026-09-28', T), 'Tomorrow');
});

test('DT-22 relativeLabel uses the weekday for today + 2', () => {
  assert.equal(relativeLabel('2026-09-29', T), 'Tue');
});

test('DT-23 relativeLabel uses the weekday up to today + 6', () => {
  assert.equal(relativeLabel('2026-10-03', T), 'Sat');
});

test('DT-24 relativeLabel uses the short date from today + 7', () => {
  assert.equal(relativeLabel('2026-10-04', T), 'Oct 4');
});

test('DT-25 relativeLabel never shows the year', () => {
  assert.equal(relativeLabel('2027-01-08', '2026-12-30'), 'Jan 8');
});

test('DT-26 relativeLabel for tomorrow across the year boundary', () => {
  assert.equal(relativeLabel('2026-12-31', '2026-12-30'), 'Tomorrow');
});

test('DT-27 relativeLabel for a past date is the short date', () => {
  assert.equal(relativeLabel('2026-09-25', T), 'Sep 25');
});

test('DT-28 formatShort has no leading zero', () => {
  assert.equal(formatShort('2026-01-05'), 'Jan 5');
});

// 4.4 Month grid

const first = (grid) => grid[0][0].date;
const last = (grid) => grid.at(-1).at(-1).date;

test('DT-30 September 2026, Monday start', () => {
  const grid = monthGrid(2026, 8, 1);
  assert.equal(grid.length, 5);
  assert.equal(first(grid), '2026-08-31');
  assert.equal(grid[0][0].inMonth, false);
  assert.equal(last(grid), '2026-10-04');
  assert.equal(grid[0][1].date, '2026-09-01');
});

test('DT-31 September 2026, Sunday start', () => {
  const grid = monthGrid(2026, 8, 0);
  assert.equal(grid.length, 5);
  assert.equal(first(grid), '2026-08-30');
  assert.equal(last(grid), '2026-10-03');
});

test('DT-32 February 2021, Monday start, has exactly 4 rows', () => {
  const grid = monthGrid(2021, 1, 1);
  assert.equal(grid.length, 4);
  assert.equal(first(grid), '2021-02-01');
  assert.equal(last(grid), '2021-02-28');
  assert.ok(grid.flat().every((c) => c.inMonth));
});

test('DT-33 February 2026, Sunday start, has exactly 4 rows', () => {
  const grid = monthGrid(2026, 1, 0);
  assert.equal(grid.length, 4);
  assert.equal(first(grid), '2026-02-01');
  assert.equal(last(grid), '2026-02-28');
});

test('DT-34 February 2026, Monday start', () => {
  const grid = monthGrid(2026, 1, 1);
  assert.equal(grid.length, 5);
  assert.equal(first(grid), '2026-01-26');
  assert.equal(last(grid), '2026-03-01');
});

test('DT-35 November 2026, Monday start, has 6 rows', () => {
  const grid = monthGrid(2026, 10, 1);
  assert.equal(grid.length, 6);
  assert.equal(first(grid), '2026-10-26');
  assert.equal(last(grid), '2026-12-06');
});

test('DT-36 December 2026 crosses into the next year', () => {
  const grid = monthGrid(2026, 11, 1);
  assert.equal(grid.length, 5);
  assert.equal(first(grid), '2026-11-30');
  assert.equal(last(grid), '2027-01-03');
});

test('DT-37 January 2027 starts in the previous year', () => {
  const grid = monthGrid(2027, 0, 1);
  assert.equal(grid.length, 5);
  assert.equal(first(grid), '2026-12-28');
  assert.equal(last(grid), '2027-01-31');
});

test('DT-38 February 2028 contains the leap day', () => {
  const grid = monthGrid(2028, 1, 1);
  const leap = grid.flat().find((c) => c.date === '2028-02-29');
  assert.equal(leap?.inMonth, true);
  assert.equal(first(grid), '2028-01-31');
  assert.equal(last(grid), '2028-03-05');
});

test('DT-39 every month 2026–2028 in both week starts is a well-formed grid', () => {
  for (let year = 2026; year <= 2028; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      for (const weekStart of [0, 1]) {
        const grid = monthGrid(year, month, weekStart);
        const cells = grid.flat();
        assert.ok(grid.length >= 4 && grid.length <= 6);
        assert.ok(grid.every((row) => row.length === 7));
        for (let i = 1; i < cells.length; i += 1) {
          assert.equal(cells[i].date, addDays(cells[i - 1].date, 1));
        }
        const inMonth = cells.filter((c) => c.inMonth).map((c) => c.date);
        const expected = Array.from({ length: daysInMonth(year, month) },
          (_, i) => isoDate(year, month, i + 1));
        assert.deepEqual(inMonth, expected);
        assert.equal(weekday(cells[0].date), weekStart);
      }
    }
  }
});

test('DT-40 month grid in America/Santiago matches UTC', () => {
  const utc = inTimeZone('UTC', () => monthGrid(2026, 8, 1));
  const santiago = inTimeZone('America/Santiago', () => monthGrid(2026, 8, 1));
  assert.deepEqual(santiago, utc);
});

// 4.5 Purity

test('DT-41 no helper reads the clock', () => {
  const RealDate = globalThis.Date;
  const realNow = RealDate.now;
  class NoClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) throw new Error('clock read');
      super(...args);
    }
  }
  NoClockDate.now = () => { throw new Error('clock read'); };
  globalThis.Date = NoClockDate;
  RealDate.now = NoClockDate.now;
  try {
    isValidISODate(T);
    parseISODate(T);
    toISODate(new RealDate(2026, 8, 27));
    compareDates(T, '2026-10-01');
    addDays(T, 1);
    diffDays(T, '2026-10-01');
    relativeLabel('2026-10-01', T);
    formatShort(T);
    monthGrid(2026, 8, 1);
  } finally {
    globalThis.Date = RealDate;
    RealDate.now = realNow;
  }
});
