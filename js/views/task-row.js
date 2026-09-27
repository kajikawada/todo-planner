// A task row, shared by the list view and the calendar day panel, plus the
// delegated event handling for rows inside a region.

import { PRIORITY_LABELS, dueStatus } from '../model.js';
import { formatShort, relativeLabel } from '../utils/date.js';
import { h, icon } from './dom.js';

// Only one row menu is open at a time, app-wide.
let openMenuId = null;
let documentListenerAdded = false;

export const rowKey = (id) => `task-${id}`;

function dueLabel(task, today) {
  if (task.dueDate === null) return null;
  const status = dueStatus(task, today);
  if (status === 'completed') return { text: formatShort(task.dueDate), status };
  if (status === 'overdue') return { text: `${formatShort(task.dueDate)} · Overdue`, status };
  return { text: relativeLabel(task.dueDate, today), status };
}

function rowMenu(task) {
  const open = openMenuId === task.id;
  const menuId = `menu-${task.id}`;
  return h('div', { class: 'row-menu' },
    h('button', {
      type: 'button',
      class: 'icon-button menu-toggle',
      'aria-label': `More actions for ${task.title}`,
      'aria-expanded': String(open),
      'aria-controls': menuId,
      dataset: { key: `menu-${task.id}`, action: 'toggle-menu' },
    }, icon('more')),
    h('div', { class: 'menu-popup', id: menuId, hidden: !open },
      h('button', {
        type: 'button', class: 'menu-item', text: 'Edit', dataset: { action: 'edit', key: `menu-edit-${task.id}` },
      }),
      h('button', {
        type: 'button', class: 'menu-item danger', text: 'Delete', dataset: { action: 'delete', key: `menu-delete-${task.id}` },
      })));
}

export function renderTaskRow(task, state) {
  const due = dueLabel(task, state.today);
  const status = dueStatus(task, state.today);
  const classes = ['task-row', `prio-${task.priority}`, `due-${status}`];
  if (task.completed) classes.push('is-completed');

  return h('li', {
    class: classes.join(' '),
    tabindex: '0',
    dataset: { key: rowKey(task.id), taskId: task.id },
  },
  h('input', {
    type: 'checkbox',
    class: 'task-check',
    tabindex: '-1',
    checked: task.completed,
    'aria-label': `Complete ${task.title}`,
    dataset: { action: 'toggle' },
  }),
  h('div', { class: 'task-main' },
    h('span', { class: 'task-title', text: task.title }),
    h('div', { class: 'task-meta' },
      h('span', {
        class: `badge badge-${task.priority}`,
        text: PRIORITY_LABELS[task.priority],
        'aria-label': `${PRIORITY_LABELS[task.priority]} priority`,
      }),
      task.category !== null && h('span', { class: 'task-category', text: task.category }),
      task.tags.map((tag) => h('button', {
        type: 'button',
        class: 'tag-chip',
        tabindex: '-1',
        text: `#${tag}`,
        'aria-pressed': String(state.filters.tags.includes(tag)),
        'aria-label': `Filter by tag ${tag}`,
        dataset: { action: 'filter-tag', tag },
      })))),
  due && h('span', { class: `task-due due-${due.status}`, text: due.text }),
  rowMenu(task));
}

function closeMenu(ctx) {
  if (openMenuId === null) return;
  openMenuId = null;
  ctx.refresh();
}

function moveRowFocus(root, row, step) {
  const rows = [...root.querySelectorAll('.task-row')];
  const target = rows[rows.indexOf(row) + step];
  if (target) target.focus();
}

/** Wires click, change, and keyboard handling for every row inside `root`. */
export function bindTaskRows(root, ctx) {
  if (!documentListenerAdded) {
    documentListenerAdded = true;
    document.addEventListener('click', (event) => {
      if (openMenuId !== null && !event.target.closest('.row-menu')) closeMenu(ctx);
    });
  }

  root.addEventListener('change', (event) => {
    const row = event.target.closest('.task-row');
    if (row && event.target.dataset.action === 'toggle') {
      ctx.toggleComplete(row.dataset.taskId, root);
    }
  });

  root.addEventListener('click', (event) => {
    const row = event.target.closest('.task-row');
    if (!row) return;
    const { taskId } = row.dataset;
    const control = event.target.closest('[data-action]');
    const action = control?.dataset.action;

    if (action === 'toggle') return; // handled by the change event
    if (action === 'filter-tag') {
      ctx.dispatch({ type: 'toggleTagFilter', tag: control.dataset.tag });
    } else if (action === 'toggle-menu') {
      openMenuId = openMenuId === taskId ? null : taskId;
      ctx.refresh();
      if (openMenuId) ctx.focusKey(`menu-edit-${taskId}`);
    } else if (action === 'edit') {
      openMenuId = null;
      ctx.openEditor(taskId, root);
    } else if (action === 'delete') {
      openMenuId = null;
      ctx.deleteTask(taskId, root);
    } else if (!event.target.closest('.row-menu')) {
      ctx.openEditor(taskId, root);
    }
  });

  root.addEventListener('keydown', (event) => {
    const row = event.target.closest('.task-row');
    if (!row) return;

    if (event.key === 'Escape' && event.target.closest('.row-menu') && openMenuId !== null) {
      event.preventDefault();
      event.stopPropagation();
      const id = openMenuId;
      closeMenu(ctx);
      ctx.focusKey(`menu-${id}`);
      return;
    }
    if (event.target !== row) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveRowFocus(root, row, event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      ctx.openEditor(row.dataset.taskId, root);
    } else if (event.key === ' ') {
      event.preventDefault();
      ctx.toggleComplete(row.dataset.taskId, root);
    }
  });
}
