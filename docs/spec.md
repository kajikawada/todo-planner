# To-do Planner — Design Specification

Status: Draft v1 · Last updated: 2026-09-27

## 1. Overview & goals

A personal, offline-first to-do planner that runs entirely in the browser. You don't need an account or a server: all data stays in the browser's `localStorage`.

**Goals**
- Capture tasks quickly and plan them by due date.
- Show what is overdue, due today, or coming up at a glance.
- Organize tasks with priorities, categories, and tags.
- Find tasks fast with search and filters.

**Non-goals (v1)**
- Syncing across devices, user accounts, or multiple users
- Notifications and reminders
- Recurring tasks

These may come later (see §9).

## 2. Data model

### 2.1 Task

| Field         | Type                              | Rules / default                                  |
|---------------|-----------------------------------|--------------------------------------------------|
| `id`          | string                            | `crypto.randomUUID()`, immutable                 |
| `title`       | string                            | Required, trimmed, 1–200 chars                   |
| `notes`       | string                            | Optional, default `""`, max 5000 chars           |
| `dueDate`     | string \| null                    | Local date `YYYY-MM-DD`, or `null`               |
| `priority`    | `"high"` \| `"medium"` \| `"low"` | Default `"medium"`                               |
| `category`    | string \| null                    | Must be in `categories` list, or `null`          |
| `tags`        | string[]                          | Lowercased, trimmed, unique, each 1–30 chars     |
| `completed`   | boolean                           | Default `false`                                  |
| `createdAt`   | string                            | ISO 8601 timestamp                               |
| `updatedAt`   | string                            | ISO 8601 timestamp, bumped on every change       |
| `completedAt` | string \| null                    | ISO timestamp when completed; `null` otherwise   |

### 2.2 Persisted state

Stored as JSON under the `localStorage` key **`todo-planner:v1`**:

```json
{
  "version": 1,
  "tasks": [ /* Task[] */ ],
  "categories": ["Work", "Personal"]
}
```

- `categories` is an ordered list of unique names (case-insensitive uniqueness, 1–40 chars).
- Deleting a category sets `category = null` on its tasks. It never deletes the tasks.
- Tags are not stored separately. The tag list is derived from all tasks.

### 2.3 Schema migration

- Every stored payload has a `version` number.
- On load, `storage.js` runs migrations in order (`migrate1to2`, …) until it reaches the current version, then saves.
- A key for a new major version (e.g. `todo-planner:v2`) is introduced only if the data can't be migrated in place.

### 2.4 UI state (not persisted as task data)

The current view (`list` / `calendar`), the active filters, the search text, and the calendar's visible month are kept in memory. The last view and month may be saved under `todo-planner:ui` so they survive a reload.

## 3. Features & behavior

### 3.1 Task CRUD
- **Quick add:** a text field at the top of the main area. Enter creates a task with the given title. If a category, tag, or calendar day filter is active, the new task inherits it.
- **Edit:** clicking a task (or pressing Enter on it) opens an edit dialog (`<dialog>`) with all fields. Save validates the input and shows inline errors. Cancel/Esc discards the changes.
- **Complete:** a checkbox toggles `completed` and sets or clears `completedAt`.
- **Delete:** available from the edit dialog and from the task's row menu. It deletes right away and shows a toast with **Undo** for 5 seconds.

### 3.2 Due dates
- Set with `<input type="date">`, or leave empty.
- Each due date is labeled and styled by where it falls:
  - **Overdue:** before today and not completed. Shown in red text with an "Overdue" label.
  - **Today:** styled to stand out, with a "Today" label.
  - **Upcoming:** after today. Shown as a relative date ("Tomorrow", "Fri", or `Oct 3` beyond 6 days).
  - **No date:** no label.
- "Today" is the user's local calendar date. It is recomputed when the page regains focus after midnight.

### 3.3 Priorities
- Three levels, each with a colored badge or left border: high, medium, and low.
- **Default sort in the List view:**
  1. Incomplete before completed
  2. Due date ascending (tasks without a date last)
  3. Priority (high → low)
  4. `createdAt` ascending
- The user can also sort by priority first or by creation date. The chosen sort is kept in UI state.

### 3.4 Categories & tags
- **Categories:** listed in the sidebar with a count of active tasks. The user can add, rename (inline), and delete them. A task has at most one category.
- **Tags:** entered as a comma-separated list in the edit dialog, or with `#tag` in the quick-add text (e.g. `Buy milk #errand`). They show as chips on the task. The sidebar lists all tags with counts.
- Clicking a category or tag in the sidebar, or a tag chip, filters to it. Clicking it again clears that filter.

### 3.5 Search & filter
- **Search:** case-insensitive substring match on title, notes, and tags. The list updates as you type, debounced by 150 ms.
- **Status filter:** All / Active / Completed. The default is Active.
- **Other filters:** category (one), tags (any number; a task must have all selected tags), and a calendar day (see §3.6).
- All active filters combine with **AND**. A filter bar shows the active filters as removable chips, plus a "Clear all" button.
- If no tasks match, the view shows an empty state with a "Clear filters" action.

### 3.6 Views
- **List view (default):** the filtered, sorted tasks. With the default sort, tasks are grouped under the headings *Overdue*, *Today*, *Upcoming*, *No date*, and *Completed*.
- **Calendar view:** a month grid (Mon–Sun, a setting can change the first day of the week).
  - Previous/next month buttons, plus a "Today" button.
  - Each day cell lists the tasks due that day (priority dot + title). If a day has more than 3 tasks, it shows "+N more".
  - Clicking a day selects it: a side or bottom panel lists that day's tasks and has a quick-add that sets `dueDate` to that day.
  - Search, category, tag, and status filters also apply in the calendar.
  - Tasks with no due date don't appear in the calendar. The panel shows a note with how many were left out.

## 4. UI layout

```
List view
┌──────────────────────────────────────────────────────────────┐
│ ☰  To-do Planner      [ Search…            ]   [List|Calendar]│
├───────────────┬──────────────────────────────────────────────┤
│ STATUS        │ [ + Add a task…  (#tags ok)             ⏎ ]  │
│ ● Active  12  │ Filters: [Work ×] [#urgent ×]   Clear all    │
│ ○ Completed   │                                              │
│ ○ All         │ OVERDUE                                      │
│               │ ☐ ▌Send invoice          #billing  Sep 25 ⚠  │
│ CATEGORIES  + │ TODAY                                        │
│ Work       5  │ ☐ ▌Team standup notes    Work      Today     │
│ Personal   7  │ UPCOMING                                     │
│               │ ☐ ▌Book dentist          Personal  Fri       │
│ TAGS          │ NO DATE                                      │
│ #urgent    2  │ ☐ ▌Read book                                 │
│ #billing   1  │                                              │
└───────────────┴──────────────────────────────────────────────┘

Calendar view
┌──────────────────────────────────────────────────────────────┐
│ ☰  To-do Planner      [ Search…            ]   [List|Calendar]│
├───────────────┬──────────────────────────────────────────────┤
│  (sidebar)    │  ‹  September 2026  ›   [Today]              │
│               │  Mon  Tue  Wed  Thu  Fri  Sat  Sun           │
│               │  ┌───┬───┬───┬───┬───┬───┬───┐               │
│               │  │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │               │
│               │  │•a │   │•b │   │   │   │   │  ...          │
│               │  └───┴───┴───┴───┴───┴───┴───┘               │
│               │  ── Sat, Sep 27 ─────────────────            │
│               │  [ + Add task for this day ⏎ ]               │
│               │  ☐ Team standup notes                        │
└───────────────┴──────────────────────────────────────────────┘
```

- **Responsive:** below 720px the sidebar becomes a drawer opened with ☰, and on small screens the calendar shows only a dot and count in each day cell. Everything must work at 360px wide.
- **Theming:** light and dark themes through `prefers-color-scheme`. Colors are defined as CSS custom properties on `:root`.
- **Priority colors:** high = red, medium = amber, low = gray/blue. Priority is never shown by color alone: there is always a text label or `aria-label`.

## 5. Accessibility

- Use semantic HTML: `header`, `nav`, `main`, lists for tasks, `<dialog>` for editing, and real `<button>` / `<input type="checkbox">` elements.
- Everything works from the keyboard:
  - `n`: focus quick-add
  - `/`: focus search
  - `Esc`: close the dialog or drawer, or clear the search if it has focus
  - `↑`/`↓`: move between tasks in a list
  - `Enter`: edit the focused task
  - `Space`: toggle completion
  - Arrow keys move between days in the calendar grid.
- Shortcuts do nothing while the user is typing in a text field.
- Focus is visible everywhere. The edit dialog traps focus and returns it to the task when it closes.
- `aria-live="polite"` announces toasts and result counts.
- Colors meet WCAG AA contrast (4.5:1 for text).

## 6. Persistence & error handling

- Only `js/storage.js` reads and writes `localStorage`.
- Changes are saved after every state change, debounced by 200 ms, and flushed on `pagehide`.
- **Corrupt data:** if parsing or validation fails, the app copies the raw value to `todo-planner:backup-<timestamp>`, starts with empty state, and shows a non-blocking warning.
- **Storage full** (`QuotaExceededError`): the app shows a persistent warning that changes may not be saved. It does not crash.
- **Storage unavailable** (private mode or blocked): the app runs in memory and shows a banner.
- **Multiple tabs:** listen for the `storage` event and reload state when another tab writes (the last write wins).

## 7. Architecture

- Plain ES modules with no build step. `index.html` loads `js/main.js` with `type="module"`.
- **Module layout:**
  - `js/main.js`: startup and global event wiring
  - `js/store.js`: a single state object, `getState()`, `dispatch(action)`, and `subscribe(fn)`
  - `js/storage.js`: load, save, and migrate
  - `js/model.js`: pure functions such as `createTask`, `validateTask`, `filterTasks`, `sortTasks`, `groupTasks`, and `parseQuickAdd`
  - `js/utils/date.js`: pure date helpers (today, compare, format, month grid)
  - `js/views/list.js`, `js/views/calendar.js`, `js/views/sidebar.js`: each renders from state
- **Data flow:** user event → `dispatch(action)` → a reducer-style update creates new state → subscribers re-render and storage saves.
- Views re-render their own region from state, with event delegation on the region's root. User-entered text is written with `textContent`, never with `innerHTML`.

## 8. Acceptance criteria

**Task CRUD**
- [ ] Typing a title and pressing Enter adds a task. An empty or whitespace-only title is rejected.
- [ ] Every field can be changed in the edit dialog, and changes persist after a reload.
- [ ] The checkbox toggles completion and sets or clears `completedAt`.
- [ ] Delete removes the task, and Undo within 5 s restores it exactly.

**Due dates & calendar**
- [ ] Overdue, today, and upcoming tasks each have their own style and label.
- [ ] The Calendar view shows tasks on their due dates, and the ‹ › and Today buttons work.
- [ ] Clicking a day lists its tasks. Quick-add there creates a task due on that day.
- [ ] Changing a task's due date moves it to the new day in the calendar.

**Priorities**
- [ ] The priority defaults to medium and shows as a badge with a text label.
- [ ] The default sort follows §3.3.

**Categories & tags**
- [ ] Categories can be created, renamed, and deleted. Deleting one leaves its tasks with no category.
- [ ] `#tag` in quick-add creates tags. Tags show as chips and in the sidebar with counts.
- [ ] Clicking a category or tag filters to it.

**Search & filter**
- [ ] Search matches title, notes, and tags, ignoring case.
- [ ] Status, category, tag, day, and search filters combine with AND. The active filters show as chips, and "Clear all" resets them.
- [ ] An empty state appears when no tasks match.

**General**
- [ ] The data survives a reload. Corrupt storage is backed up, and the app still starts.
- [ ] Everything works with the keyboard alone and at 360px width, in both light and dark themes.
- [ ] No console errors during normal use.

## 9. Future ideas

- Recurring tasks
- JSON export and import (backup and restore)
- Drag-and-drop reordering, and dragging tasks between days in the calendar
- Reminders through the Notifications API
- Subtasks and checklists
- A week view
