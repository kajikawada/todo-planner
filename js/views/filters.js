// Filter bar: the active filters as removable chips, plus "Clear all".

import { hasActiveFilters } from '../model.js';
import { formatLong } from '../utils/date.js';
import { h, icon, renderInto } from './dom.js';

let root = null;
let ctx = null;

const STATUS_LABELS = { completed: 'Completed', all: 'All' };

export function initFilterBar(element, context) {
  root = element;
  ctx = context;
  root.addEventListener('click', onClick);
}

function chipsFor(filters) {
  const chips = [];
  if (filters.status !== 'active') {
    chips.push({ key: 'status', text: `Status: ${STATUS_LABELS[filters.status]}`, label: `status ${STATUS_LABELS[filters.status]}` });
  }
  if (filters.category !== null) {
    chips.push({ key: 'category', text: filters.category, label: `category ${filters.category}` });
  }
  for (const tag of filters.tags) {
    chips.push({ key: `tag:${tag}`, text: `#${tag}`, label: `tag ${tag}` });
  }
  if (filters.day !== null) {
    chips.push({ key: 'day', text: formatLong(filters.day), label: `day ${formatLong(filters.day)}` });
  }
  if (filters.search.trim() !== '') {
    const search = filters.search.trim();
    chips.push({ key: 'search', text: `“${search}”`, label: `search ${search}` });
  }
  return chips;
}

function removeAction(key, filters) {
  if (key === 'status') return { type: 'setStatus', status: 'active' };
  if (key === 'category') return { type: 'toggleCategoryFilter', name: filters.category };
  if (key === 'day') return { type: 'toggleDayFilter', date: filters.day };
  if (key === 'search') return { type: 'setSearch', search: '' };
  return { type: 'toggleTagFilter', tag: key.slice('tag:'.length) };
}

function onClick(event) {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  if (control.dataset.action === 'clear-all') {
    ctx.clearFilters();
    return;
  }
  if (control.dataset.action !== 'remove-filter') return;

  // Keep keyboard focus in the bar: the next chip, else the previous, else quick-add.
  const buttons = [...root.querySelectorAll('[data-action="remove-filter"]')];
  const index = buttons.indexOf(control);
  const neighbor = buttons[index + 1] ?? buttons[index - 1];
  ctx.dispatch(removeAction(control.dataset.filter, ctx.getState().filters));
  if (neighbor) ctx.focusKey(neighbor.dataset.key);
  else ctx.focusQuickAdd();
}

export function renderFilterBar(state) {
  const chips = chipsFor(state.filters);
  root.hidden = !hasActiveFilters(state.filters);
  if (root.hidden) {
    root.replaceChildren();
    return;
  }
  renderInto(root,
    h('span', { class: 'filter-bar-label', id: 'filter-bar-label', text: 'Filters:' }),
    h('ul', { class: 'chip-list', 'aria-labelledby': 'filter-bar-label' },
      chips.map((chip) => h('li', { class: 'chip' },
        h('span', { class: 'chip-text', text: chip.text }),
        h('button', {
          type: 'button',
          class: 'chip-remove',
          'aria-label': `Remove filter: ${chip.label}`,
          dataset: { action: 'remove-filter', filter: chip.key, key: `chip-${chip.key}` },
        }, icon('close'))))),
    h('button', {
      type: 'button', class: 'link-button', text: 'Clear all', dataset: { action: 'clear-all', key: 'clear-all' },
    }));
}
