// Edit dialog: a modal <dialog> with every task field and inline validation.

import { editTask, validateTask } from '../model.js';
import { h } from './dom.js';

const FIELDS = ['title', 'notes', 'dueDate', 'priority', 'category', 'tags'];

let dialog = null;
let form = null;
let ctx = null;
let editingId = null;
// Set when the dialog closes because its task is going away, so focus isn't
// returned to a row that no longer exists. The close event fires async.
let skipFocusReturn = false;
let shownCategories = null;

const input = (name) => form.elements.namedItem(name);
const errorEl = (name) => document.getElementById(`edit-${name}-error`);

export function initDialog(element, context) {
  dialog = element;
  form = dialog.querySelector('form');
  ctx = context;

  form.addEventListener('submit', onSave);
  dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-action="delete"]').addEventListener('click', onDelete);
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('keydown', trapFocus);
}

export function isDialogOpen() {
  return dialog.open;
}

function fillCategories(categories, selected) {
  const select = input('category');
  select.replaceChildren(
    h('option', { value: '', text: 'None' }),
    ...categories.map((name) => h('option', { value: name, text: name })),
  );
  select.value = selected !== null && categories.includes(selected) ? selected : '';
  shownCategories = categories;
}

export function openEditor(id) {
  const state = ctx.getState();
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  editingId = id;
  input('title').value = task.title;
  input('notes').value = task.notes;
  input('dueDate').value = task.dueDate ?? '';
  input('priority').value = task.priority;
  fillCategories(state.categories, task.category);
  input('tags').value = task.tags.join(', ');
  input('completed').checked = task.completed;
  showErrors({});
  dialog.showModal();
  input('title').focus();
}

function readFields() {
  return {
    title: input('title').value,
    notes: input('notes').value,
    dueDate: input('dueDate').value || null,
    priority: input('priority').value,
    category: input('category').value || null,
    tags: input('tags').value,
    completed: input('completed').checked,
  };
}

function showErrors(errors) {
  for (const name of FIELDS) {
    const field = input(name);
    const message = errorEl(name);
    const describedBy = (field.dataset.hint ? [field.dataset.hint] : []);
    if (errors[name]) {
      message.textContent = errors[name];
      message.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      describedBy.push(message.id);
    } else {
      message.textContent = '';
      message.hidden = true;
      field.removeAttribute('aria-invalid');
    }
    if (describedBy.length > 0) field.setAttribute('aria-describedby', describedBy.join(' '));
    else field.removeAttribute('aria-describedby');
  }
}

const sameTask = (a, b) => JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });

function onSave(event) {
  event.preventDefault();
  const state = ctx.getState();
  const task = state.tasks.find((t) => t.id === editingId);
  if (!task) {
    dialog.close();
    return;
  }
  const fields = readFields();
  const now = ctx.now();
  const candidate = editTask(task, fields, now);
  const { errors } = validateTask(candidate, state.categories);
  if (input('dueDate').validity.badInput) errors.dueDate = 'Enter a complete date, or clear the field.';

  const visible = Object.fromEntries(Object.entries(errors).filter(([k]) => FIELDS.includes(k)));
  if (Object.keys(visible).length > 0) {
    showErrors(visible);
    const first = FIELDS.find((name) => visible[name]);
    input(first).focus();
    return;
  }
  if (!sameTask(candidate, task)) {
    ctx.dispatch({ type: 'updateTask', id: editingId, fields, now });
  }
  dialog.close();
}

function onDelete() {
  const id = editingId;
  skipFocusReturn = true;
  dialog.close();
  ctx.deleteTask(id);
}

function onClose() {
  const id = editingId;
  editingId = null;
  if (!skipFocusReturn && id !== null) ctx.restoreFocusToTask(id);
  skipFocusReturn = false;
}

/** Keeps Tab and Shift+Tab inside the dialog. */
function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('input, select, textarea, button')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Keeps an open dialog in step with state changes (e.g. from another tab). */
export function syncDialog(state) {
  if (!dialog.open || editingId === null) return;
  if (!state.tasks.some((t) => t.id === editingId)) {
    skipFocusReturn = true;
    dialog.close();
    ctx.showToast({ message: 'The task you were editing was deleted in another tab.' });
    ctx.focusQuickAdd();
    return;
  }
  if (state.categories !== shownCategories) {
    fillCategories(state.categories, input('category').value || null);
  }
}
