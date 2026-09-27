// Sidebar: status filter, categories (add / rename inline / delete), and tags.

import {
  countByCategory, countByStatus, countByTag, validateCategoryName,
} from '../model.js';
import { h, icon, renderInto } from './dom.js';

let root = null;
let ctx = null;

// Local editing state; not part of the app state.
const edit = {
  adding: false,
  addDraft: '',
  addError: null,
  renaming: null,
  renameDraft: '',
  renameError: null,
};

const STATUS_OPTIONS = [
  ['active', 'Active'],
  ['completed', 'Completed'],
  ['all', 'All'],
];

export function initSidebar(element, context) {
  root = element;
  ctx = context;
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('focusout', onFocusOut);
}

function onClick(event) {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action } = control.dataset;
  const { name } = control.dataset;

  if (action === 'status') {
    ctx.dispatch({ type: 'setStatus', status: control.dataset.value });
  } else if (action === 'category') {
    ctx.dispatch({ type: 'toggleCategoryFilter', name });
  } else if (action === 'tag') {
    ctx.dispatch({ type: 'toggleTagFilter', tag: control.dataset.tag });
  } else if (action === 'show-add-category') {
    Object.assign(edit, { adding: !edit.adding, addDraft: '', addError: null });
    ctx.refresh();
    ctx.focusKey(edit.adding ? 'add-category-input' : 'add-category');
  } else if (action === 'cancel-add-category') {
    cancelAdd();
  } else if (action === 'rename-category') {
    Object.assign(edit, { renaming: name, renameDraft: name, renameError: null });
    ctx.refresh();
    const input = root.querySelector('.rename-input');
    input?.focus();
    input?.select();
  } else if (action === 'delete-category') {
    ctx.dispatch({ type: 'deleteCategory', name, now: ctx.now() });
    ctx.announce(`Deleted category ${name}. Its tasks now have no category.`);
    ctx.focusKey('add-category');
  } else if (action === 'close-drawer') {
    ctx.closeDrawer();
  }
}

function onSubmit(event) {
  if (!event.target.matches('.add-category-form')) return;
  event.preventDefault();
  const state = ctx.getState();
  const error = validateCategoryName(edit.addDraft, state.categories);
  if (error) {
    edit.addError = error;
    ctx.refresh();
    return;
  }
  const name = edit.addDraft.trim();
  Object.assign(edit, { adding: false, addDraft: '', addError: null });
  ctx.dispatch({ type: 'addCategory', name });
  ctx.announce(`Added category ${name}.`);
  ctx.focusKey(`cat-${name}`);
}

function onInput(event) {
  if (event.target.matches('.add-category-input')) edit.addDraft = event.target.value;
  if (event.target.matches('.rename-input')) edit.renameDraft = event.target.value;
}

function commitRename() {
  const state = ctx.getState();
  const from = edit.renaming;
  const error = validateCategoryName(edit.renameDraft, state.categories, from);
  if (error) {
    edit.renameError = error;
    ctx.refresh();
    return;
  }
  const to = edit.renameDraft.trim();
  Object.assign(edit, { renaming: null, renameDraft: '', renameError: null });
  ctx.dispatch({ type: 'renameCategory', from, to, now: ctx.now() });
  ctx.refresh();
  ctx.focusKey(`cat-${to}`);
}

function cancelRename({ focus = true } = {}) {
  const name = edit.renaming;
  Object.assign(edit, { renaming: null, renameDraft: '', renameError: null });
  ctx.refresh();
  if (focus) ctx.focusKey(`cat-${name}`);
}

function cancelAdd() {
  Object.assign(edit, { adding: false, addDraft: '', addError: null });
  ctx.refresh();
  ctx.focusKey('add-category');
}

function onKeydown(event) {
  if (event.target.matches('.rename-input')) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelRename();
    }
  } else if (event.target.matches('.add-category-input') && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    cancelAdd();
  }
}

function onFocusOut(event) {
  // Leaving the rename field for another control cancels the rename. When the
  // whole window loses focus (relatedTarget null) the edit is kept.
  if (!event.target.matches('.rename-input') || !event.target.isConnected) return;
  if (event.relatedTarget && edit.renaming !== null) cancelRename({ focus: false });
}

function filterButton({ label, count, pressed, dataset, extraLabel }) {
  return h('button', {
    type: 'button',
    class: 'filter-item',
    'aria-pressed': String(pressed),
    'aria-label': count === null ? null : `${extraLabel ?? label}, ${count} active`,
    dataset,
  },
  h('span', { class: 'filter-label', text: label }),
  count !== null && h('span', { class: 'count', text: String(count) }));
}

function statusSection(state) {
  const counts = countByStatus(state.tasks);
  return h('section', { class: 'sidebar-section', 'aria-labelledby': 'status-heading' },
    h('h2', { class: 'sidebar-heading', id: 'status-heading', text: 'Status' }),
    h('ul', { class: 'filter-list' }, STATUS_OPTIONS.map(([value, label]) => h('li', {},
      h('button', {
        type: 'button',
        class: 'filter-item',
        'aria-pressed': String(state.filters.status === value),
        'aria-label': `${label}, ${counts[value]} tasks`,
        dataset: { action: 'status', value, key: `status-${value}` },
      },
      h('span', { class: 'filter-label', text: label }),
      h('span', { class: 'count', text: String(counts[value]) }))))));
}

function addCategoryForm() {
  const invalid = edit.addError !== null;
  return h('form', { class: 'add-category-form', novalidate: true },
    h('input', {
      class: 'add-category-input',
      type: 'text',
      value: edit.addDraft,
      autocomplete: 'off',
      'aria-label': 'New category name',
      'aria-invalid': invalid ? 'true' : null,
      'aria-describedby': invalid ? 'add-category-error' : null,
      placeholder: 'New category',
      dataset: { key: 'add-category-input' },
    }),
    h('div', { class: 'inline-actions' },
      h('button', { type: 'submit', class: 'button small primary', text: 'Add' }),
      h('button', {
        type: 'button', class: 'button small', text: 'Cancel', dataset: { action: 'cancel-add-category' },
      })),
    invalid && h('p', { class: 'field-error', id: 'add-category-error', text: edit.addError }));
}

function categoryItem(name, count, state) {
  if (edit.renaming === name) {
    const invalid = edit.renameError !== null;
    return h('li', { class: 'category-item renaming' },
      h('input', {
        class: 'rename-input',
        type: 'text',
        value: edit.renameDraft,
        autocomplete: 'off',
        'aria-label': `Rename category ${name}. Press Enter to save or Escape to cancel.`,
        'aria-invalid': invalid ? 'true' : null,
        'aria-describedby': invalid ? 'rename-error' : null,
        dataset: { key: 'rename-input' },
      }),
      invalid && h('p', { class: 'field-error', id: 'rename-error', text: edit.renameError }));
  }
  return h('li', { class: 'category-item' },
    filterButton({
      label: name,
      count,
      pressed: state.filters.category === name,
      dataset: { action: 'category', name, key: `cat-${name}` },
    }),
    h('button', {
      type: 'button',
      class: 'icon-button small',
      'aria-label': `Rename category ${name}`,
      dataset: { action: 'rename-category', name, key: `rename-${name}` },
    }, icon('edit')),
    h('button', {
      type: 'button',
      class: 'icon-button small',
      'aria-label': `Delete category ${name}`,
      dataset: { action: 'delete-category', name, key: `delete-${name}` },
    }, icon('trash')));
}

function categorySection(state) {
  const counts = countByCategory(state.tasks, state.categories);
  return h('section', { class: 'sidebar-section', 'aria-labelledby': 'categories-heading' },
    h('div', { class: 'sidebar-section-header' },
      h('h2', { class: 'sidebar-heading', id: 'categories-heading', text: 'Categories' }),
      h('button', {
        type: 'button',
        class: 'icon-button small',
        'aria-label': 'Add category',
        'aria-expanded': String(edit.adding),
        dataset: { action: 'show-add-category', key: 'add-category' },
      }, icon('plus'))),
    edit.adding && addCategoryForm(),
    state.categories.length === 0
      ? h('p', { class: 'sidebar-empty', text: 'No categories.' })
      : h('ul', { class: 'filter-list' },
        state.categories.map((name) => categoryItem(name, counts[name], state))));
}

function tagSection(state) {
  const tags = countByTag(state.tasks);
  return h('section', { class: 'sidebar-section', 'aria-labelledby': 'tags-heading' },
    h('h2', { class: 'sidebar-heading', id: 'tags-heading', text: 'Tags' }),
    tags.length === 0
      ? h('p', { class: 'sidebar-empty', text: 'No tags yet.' })
      : h('ul', { class: 'filter-list' }, tags.map(({ tag, count }) => h('li', {},
        filterButton({
          label: `#${tag}`,
          extraLabel: `Tag ${tag}`,
          count,
          pressed: state.filters.tags.includes(tag),
          dataset: { action: 'tag', tag, key: `tag-${tag}` },
        })))));
}

export function renderSidebar(state) {
  if (edit.renaming !== null && !state.categories.includes(edit.renaming)) {
    Object.assign(edit, { renaming: null, renameDraft: '', renameError: null });
  }
  renderInto(root,
    h('div', { class: 'drawer-header' },
      h('span', { class: 'drawer-title', text: 'Filters' }),
      h('button', {
        type: 'button', class: 'icon-button', 'aria-label': 'Close sidebar', dataset: { action: 'close-drawer' },
      }, icon('close'))),
    statusSection(state),
    categorySection(state),
    tagSection(state));
}
