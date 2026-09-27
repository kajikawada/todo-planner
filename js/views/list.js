// List view: the filtered, sorted tasks, grouped by due status for the default sort.

import { filterTasks, groupTasks, hasActiveFilters, sortTasks } from '../model.js';
import { h, pluralize, renderInto } from './dom.js';
import { bindTaskRows, renderTaskRow } from './task-row.js';

let root = null;

const SORT_OPTIONS = [
  ['default', 'Due date'],
  ['priority', 'Priority'],
  ['created', 'Newest first'],
];

export function initList(element, ctx) {
  root = element;
  bindTaskRows(root, ctx);
  root.addEventListener('change', (event) => {
    if (event.target.dataset.action === 'sort') {
      ctx.dispatch({ type: 'setSort', sort: event.target.value });
    }
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="clear-filters"]')) ctx.clearFilters();
  });
}

function toolbar(state, count) {
  return h('div', { class: 'list-toolbar' },
    h('p', { class: 'result-count', text: pluralize(count, 'task') }),
    h('label', { class: 'sort-control' },
      h('span', { text: 'Sort by' }),
      h('select', { dataset: { action: 'sort', key: 'sort' } },
        SORT_OPTIONS.map(([value, label]) => h('option', {
          value, text: label, selected: state.sort === value,
        })))));
}

function emptyState(state) {
  if (hasActiveFilters(state.filters)) {
    return h('div', { class: 'empty-state' },
      h('p', { text: 'No tasks match your filters.' }),
      h('button', {
        type: 'button', class: 'button', text: 'Clear filters', dataset: { action: 'clear-filters', key: 'clear-filters' },
      }));
  }
  return h('div', { class: 'empty-state' },
    h('p', { text: state.tasks.length === 0 ? 'No tasks yet. Add one above.' : 'Nothing left to do.' }));
}

const taskList = (tasks, state, labelledBy) => h('ul', {
  class: 'task-list', 'aria-labelledby': labelledBy,
}, tasks.map((task) => renderTaskRow(task, state)));

export function renderList(state) {
  const tasks = sortTasks(filterTasks(state.tasks, state.filters), state.sort);
  if (tasks.length === 0) {
    renderInto(root, toolbar(state, 0), emptyState(state));
    return;
  }
  if (state.sort !== 'default') {
    renderInto(root, toolbar(state, tasks.length),
      h('h2', { class: 'visually-hidden', id: 'group-all', text: 'Tasks' }),
      taskList(tasks, state, 'group-all'));
    return;
  }
  renderInto(root, toolbar(state, tasks.length),
    groupTasks(tasks, state.today).map((group) => h('section', { class: `task-group group-${group.key}` },
      h('h2', { class: 'group-heading', id: `group-${group.key}` },
        group.label,
        h('span', { class: 'group-count', text: String(group.tasks.length), 'aria-hidden': 'true' })),
      taskList(group.tasks, state, `group-${group.key}`))));
}

export function clearList() {
  root.replaceChildren();
}
