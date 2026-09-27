// Calendar view: a month grid with a panel for the selected day.

import { PRIORITY_LABELS, filterTasks, sortTasks } from '../model.js';
import {
  addDays, addMonths, formatFull, formatLong, formatMonthYear, monthGrid, monthOf,
} from '../utils/date.js';
import { h, icon, pluralize, renderInto } from './dom.js';
import { bindTaskRows, renderTaskRow } from './task-row.js';

const MAX_TASKS_PER_CELL = 3;

let root = null;
let ctx = null;
// The grid cell that holds the roving tab stop. null means "pick a sensible default".
let focusedDate = null;
let dayAddDraft = '';
let dayAddHint = '';

export function initCalendar(element, context) {
  root = element;
  ctx = context;
  bindTaskRows(root, ctx);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', (event) => {
    if (event.target.matches('.day-add-input')) {
      dayAddDraft = event.target.value;
      dayAddHint = '';
    }
  });
}

function isInVisibleMonth(date, state) {
  const { year, month } = monthOf(date);
  return year === state.month.year && month === state.month.month;
}

function defaultFocusDate(state) {
  if (focusedDate && isInVisibleMonth(focusedDate, state)) return focusedDate;
  if (state.filters.day && isInVisibleMonth(state.filters.day, state)) return state.filters.day;
  if (isInVisibleMonth(state.today, state)) return state.today;
  const { year, month } = state.month;
  return monthGrid(year, month, state.weekStart).flat().find((c) => c.inMonth).date;
}

function showMonth(year, month) {
  focusedDate = null;
  ctx.dispatch({ type: 'setMonth', year, month });
}

function selectDay(date) {
  const state = ctx.getState();
  focusedDate = date;
  if (!isInVisibleMonth(date, state)) ctx.dispatch({ type: 'setMonth', ...monthOf(date) });
  ctx.dispatch({ type: 'toggleDayFilter', date });
  ctx.focusKey(`day-${date}`);
}

function onClick(event) {
  const cell = event.target.closest('td[data-date]');
  if (cell) {
    selectDay(cell.dataset.date);
    return;
  }
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const state = ctx.getState();
  const { action } = control.dataset;
  if (action === 'prev-month' || action === 'next-month') {
    const next = addMonths(state.month.year, state.month.month, action === 'prev-month' ? -1 : 1);
    showMonth(next.year, next.month);
  } else if (action === 'this-month') {
    focusedDate = state.today;
    ctx.dispatch({ type: 'setMonth', ...monthOf(state.today) });
    ctx.refresh();
  } else if (action === 'clear-day' && state.filters.day) {
    ctx.dispatch({ type: 'toggleDayFilter', date: state.filters.day });
    ctx.focusKey(`day-${focusedDate ?? state.filters.day}`);
  }
}

const ARROW_STEPS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function onKeydown(event) {
  const cell = event.target.closest('td[data-date]');
  if (!cell || event.target !== cell) return;
  if (event.key in ARROW_STEPS) {
    event.preventDefault();
    const date = addDays(cell.dataset.date, ARROW_STEPS[event.key]);
    focusedDate = date;
    const state = ctx.getState();
    if (isInVisibleMonth(date, state)) ctx.refresh();
    else ctx.dispatch({ type: 'setMonth', ...monthOf(date) });
    ctx.focusKey(`day-${date}`);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectDay(cell.dataset.date);
  }
}

function onChange(event) {
  if (event.target.dataset.action === 'week-start') {
    ctx.dispatch({ type: 'setWeekStart', weekStart: Number(event.target.value) });
  }
}

function onSubmit(event) {
  if (!event.target.matches('.day-add')) return;
  event.preventDefault();
  const error = ctx.quickAdd(dayAddDraft);
  if (error) {
    dayAddHint = error;
  } else {
    dayAddDraft = '';
    dayAddHint = '';
  }
  ctx.refresh();
  ctx.focusKey('day-add-input');
}

function toolbar(state) {
  const { year, month } = state.month;
  return h('div', { class: 'cal-toolbar' },
    h('div', { class: 'cal-nav' },
      h('button', {
        type: 'button', class: 'icon-button', 'aria-label': 'Previous month', dataset: { action: 'prev-month', key: 'prev-month' },
      }, icon('prev')),
      h('h2', { class: 'cal-title', id: 'cal-title', 'aria-live': 'polite', text: formatMonthYear(year, month) }),
      h('button', {
        type: 'button', class: 'icon-button', 'aria-label': 'Next month', dataset: { action: 'next-month', key: 'next-month' },
      }, icon('next')),
      h('button', {
        type: 'button', class: 'button', text: 'Today', dataset: { action: 'this-month', key: 'this-month' },
      })),
    h('label', { class: 'week-start' },
      h('span', { text: 'Week starts on' }),
      h('select', { dataset: { action: 'week-start', key: 'week-start' } },
        h('option', { value: '1', text: 'Monday', selected: state.weekStart === 1 }),
        h('option', { value: '0', text: 'Sunday', selected: state.weekStart === 0 }))));
}

function bucketByDate(tasks) {
  const byDate = new Map();
  for (const task of tasks) {
    if (task.dueDate === null) continue;
    if (!byDate.has(task.dueDate)) byDate.set(task.dueDate, []);
    byDate.get(task.dueDate).push(task);
  }
  return byDate;
}

function dayCell(cell, tasks, state, tabStop) {
  const isToday = cell.date === state.today;
  const selected = cell.date === state.filters.day;
  const classes = ['day'];
  if (!cell.inMonth) classes.push('outside');
  if (isToday) classes.push('today');
  if (selected) classes.push('selected');

  const shown = tasks.slice(0, MAX_TASKS_PER_CELL);
  const more = tasks.length - shown.length;
  const label = [formatFull(cell.date), isToday ? 'today' : null, pluralize(tasks.length, 'task')]
    .filter(Boolean).join(', ');

  return h('td', {
    class: classes.join(' '),
    tabindex: tabStop ? '0' : '-1',
    'aria-selected': String(selected),
    'aria-current': isToday ? 'date' : null,
    'aria-label': label,
    dataset: { date: cell.date, key: `day-${cell.date}` },
  },
  h('span', { class: 'day-number', text: String(cell.day), 'aria-hidden': 'true' }),
  tasks.length > 0 && h('ul', { class: 'day-tasks', 'aria-hidden': 'true' },
    shown.map((task) => h('li', {
      class: `day-task prio-${task.priority}${task.completed ? ' is-completed' : ''}`,
      title: `${task.title} (${PRIORITY_LABELS[task.priority]} priority)`,
    },
    h('span', { class: 'dot' }),
    h('span', { class: 'day-task-title', text: task.title }))),
    more > 0 && h('li', { class: 'day-more', text: `+${more} more` })),
  tasks.length > 0 && h('span', { class: 'day-summary', 'aria-hidden': 'true' },
    h('span', { class: 'dot' }),
    String(tasks.length)));
}

function grid(state, byDate) {
  const { year, month } = state.month;
  const rows = monthGrid(year, month, state.weekStart);
  const tabStop = defaultFocusDate(state);
  const headers = rows[0].map((c) => formatFull(c.date).split(',')[0]);
  return h('div', { class: 'cal-grid-wrap' },
    h('table', { class: 'month-grid', role: 'grid', 'aria-labelledby': 'cal-title' },
      h('thead', {}, h('tr', {}, headers.map((name) => h('th', { scope: 'col', abbr: name },
        h('span', { 'aria-hidden': 'true', text: name.slice(0, 3) }),
        h('span', { class: 'visually-hidden', text: name }))))),
      h('tbody', {}, rows.map((row) => h('tr', {},
        row.map((cell) => dayCell(cell, byDate.get(cell.date) ?? [], state, cell.date === tabStop)))))));
}

function dayPanel(state, undatedCount) {
  const { day } = state.filters;
  const note = undatedCount > 0 && h('p', {
    class: 'undated-note',
    text: `${pluralize(undatedCount, 'task')} with no due date ${undatedCount === 1 ? 'isn’t' : 'aren’t'} shown in the calendar.`,
  });
  if (!day) {
    return h('section', { class: 'day-panel', 'aria-label': 'Selected day' },
      h('p', { class: 'muted', text: 'Select a day to see its tasks and add new ones.' }),
      note);
  }
  const tasks = sortTasks(filterTasks(state.tasks, state.filters), 'default');
  const heading = formatLong(day);
  return h('section', { class: 'day-panel', 'aria-labelledby': 'day-panel-title' },
    h('div', { class: 'day-panel-header' },
      h('h3', { class: 'day-panel-title', id: 'day-panel-title', text: heading }),
      h('button', {
        type: 'button', class: 'icon-button', 'aria-label': `Clear selected day ${heading}`, dataset: { action: 'clear-day' },
      }, icon('close'))),
    h('form', { class: 'day-add', novalidate: true },
      h('input', {
        class: 'day-add-input text-input',
        type: 'text',
        value: dayAddDraft,
        autocomplete: 'off',
        placeholder: '+ Add task for this day',
        'aria-label': `Add a task due ${heading}`,
        'aria-describedby': 'day-add-hint',
        dataset: { key: 'day-add-input' },
      }),
      h('p', { class: 'hint', id: 'day-add-hint', 'aria-live': 'polite', text: dayAddHint })),
    tasks.length === 0
      ? h('p', { class: 'muted', text: 'No matching tasks on this day.' })
      : h('ul', { class: 'task-list', 'aria-labelledby': 'day-panel-title' },
        tasks.map((task) => renderTaskRow(task, state))),
    note);
}

export function renderCalendar(state) {
  const visible = filterTasks(state.tasks, { ...state.filters, day: null });
  const byDate = bucketByDate(sortTasks(visible, 'default'));
  const undatedCount = visible.filter((t) => t.dueDate === null).length;
  renderInto(root, toolbar(state), grid(state, byDate), dayPanel(state, undatedCount));
}

export function clearCalendar() {
  focusedDate = null;
  root.replaceChildren();
}
