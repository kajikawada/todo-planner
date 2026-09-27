// Toasts (one at a time, polite live region) and persistent banners.

import { h, icon } from './dom.js';

let toastRoot = null;
let bannerRoot = null;
let current = null;

export function initNotices({ toasts, banners }) {
  toastRoot = toasts;
  bannerRoot = banners;
}

function startTimer(toast) {
  toast.startedAt = performance.now();
  toast.timer = setTimeout(() => expire(toast), toast.remaining);
}

function pauseTimer(toast) {
  if (toast.timer === null) return;
  clearTimeout(toast.timer);
  toast.timer = null;
  toast.remaining = Math.max(1000, toast.remaining - (performance.now() - toast.startedAt));
}

function removeToast(toast) {
  if (toast.timer !== null) clearTimeout(toast.timer);
  toast.timer = null;
  toast.el.remove();
  if (current === toast) current = null;
}

function expire(toast) {
  removeToast(toast);
  toast.onExpire?.();
}

/**
 * Shows a toast, replacing any current one (the replaced toast's onExpire is
 * not called). The timer pauses while the toast has focus or the pointer.
 */
export function showToast({ message, actionLabel, onAction, onExpire, duration = 5000 }) {
  if (current) removeToast(current);
  const toast = { onExpire, remaining: duration, timer: null, startedAt: 0, el: null };

  const action = actionLabel && h('button', { type: 'button', class: 'toast-action', text: actionLabel });
  const dismiss = h('button', { type: 'button', class: 'icon-button small', 'aria-label': 'Dismiss' }, icon('close'));
  toast.el = h('div', { class: 'toast' }, h('p', { class: 'toast-message', text: message }), action, dismiss);

  action?.addEventListener('click', () => {
    removeToast(toast);
    onAction();
  });
  dismiss.addEventListener('click', () => expire(toast));
  toast.el.addEventListener('focusin', () => pauseTimer(toast));
  toast.el.addEventListener('pointerenter', () => pauseTimer(toast));
  toast.el.addEventListener('focusout', (event) => {
    if (!toast.el.contains(event.relatedTarget) && toast.timer === null && current === toast) startTimer(toast);
  });
  toast.el.addEventListener('pointerleave', () => {
    if (!toast.el.contains(document.activeElement) && toast.timer === null && current === toast) startTimer(toast);
  });

  current = toast;
  toastRoot.append(toast.el);
  startTimer(toast);
}

export function hideToast() {
  if (current) removeToast(current);
}

const banners = new Map();

/** Shows (or replaces) the banner with this id. */
export function setBanner(id, { message, dismissible = false }) {
  clearBanner(id);
  const el = h('div', { class: 'banner', dataset: { banner: id } },
    h('p', { text: message }),
    dismissible && h('button', { type: 'button', class: 'button small', text: 'Dismiss' }));
  el.querySelector('button')?.addEventListener('click', () => clearBanner(id));
  banners.set(id, el);
  bannerRoot.append(el);
}

export function clearBanner(id) {
  banners.get(id)?.remove();
  banners.delete(id);
}
