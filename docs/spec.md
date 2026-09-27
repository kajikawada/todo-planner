# To-do Planner — Design Specification

Status: Draft v2 · Last updated: 2026-09-27

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
| `title`       | string                            | Required, trimmed, 1–200 chars (see below)       |
| `notes`       | string                            | Optional, default `""`, max 5000 chars           |
| `dueDate`     | string \| null                    | A real local date `YYYY-MM-DD`, or `null`        |
| `priority`    | `"high"` \| `"medium"` \| `"low"` | Default `"medium"`                               |
| `category`    | string \| null                    | Exactly matches a `categories` entry, or `null`  |
| `tags`        | string[]                          | Lowercased, trimmed, unique, each 1–30 chars     |
| `completed`   | boolean                           | Default `false`                                  |
| `createdAt`   | string                            | ISO 8601 timestamp                               |
| `updatedAt`   | string                            | ISO 8601 timestamp, bumped on every change       |
| `completedAt` | string \| null                    | ISO timestamp when completed; `null` otherwise   |

- **Lengths** are measured after trimming, in UTF-16 code units (JavaScript `length`).
- **`dueDate`:** an empty date input is stored as `null`, never `""`. Dates such as `2026-02-30` are invalid.
- **`category`** is compared exactly and case-sensitively with the `categories` list.
- **Tags** may not contain whitespace or commas. When tags are entered, a leading `#` is dropped, and empty entries are ignored. Duplicates are removed, keeping the first one.
- **`completed` and `completedAt` must agree:** `completedAt` is set if and only if `completed` is `true`.
- A stored task has exactly these 11 fields. A task with a missing or unknown field is invalid.

### 2.2 Persisted state

Stored as JSON under the `localStorage` key **`todo-planner:v1`**:

```json
{
  "version": 1,
  "tasks": [ /* Task[] */ ],
  "categories": ["Work", "Personal"]
}
```

- `categories` is an ordered list of unique names (case-insensitive uniqueness, trimmed, 1–40 chars). New categories are added at the end.
- On first run (no stored data), `categories` is `["Work", "Personal"]` and `tasks` is empty.
- Task `id`s are unique.
- Deleting a category sets `category = null` on its tasks. It never deletes the tasks.
- Tags are not stored separately. The tag list is derived from all tasks.
- The payload is valid only if every part of it is valid. If any single task is invalid, the whole payload is treated as corrupt (§6). The app never drops or repairs individual tasks silently.

### 2.3 Schema migration

- Every stored payload has a `version` number.
- On load, `storage.js` runs migrations in order (`migrate1to2`, …) until it reaches the current version, then saves.
- A key for a new major version (e.g. `todo-planner:v2`) is introduced only if the data can't be migrated in place.
- A payload with no `version`, a `version` higher than the app supports, or a migration that throws is treated as corrupt (§6).

### 2.4 UI state (not persisted as task data)

UI state is kept in memory. Part of it is also saved under `todo-planner:ui` so it survives a reload:

| Saved under `todo-planner:ui`                     | Memory only (reset on reload)                          |
|---------------------------------------------------|--------------------------------------------------------|
| View (`list` / `calendar`)                         | Status filter (back to Active)                         |
| Calendar's visible month                          | Category, tag, and day filters                          |
| Sort (`default` / `priority` / `created`)         | Search text                                            |
| First day of the week (Monday or Sunday; default Monday) |                                                  |

If `todo-planner:ui` is missing or invalid, the defaults are used silently. No backup or warning is made for it.

## 3. Features & behavior

### 3.1 Task CRUD
- **Quick add:** a text field at the top of the main area. Enter creates a task with the given title. If the title is empty after parsing, nothing is created. After a task is added, the field clears and keeps focus.
  - **Inherited filters:** the new task takes the active category filter, **all** active tag filters, and the active day filter (as `dueDate`). It does not take the search text or the status filter.
  - **`#tag` parsing:** a tag is a `#` at the start of the text or right after whitespace, followed by one or more characters up to the next whitespace or comma.
    - Each tag is removed from the title and added to `tags`, lowercased and deduplicated.
    - After a tag is removed, the whitespace around it collapses to one space, and any space left right before a comma is removed. Other whitespace the user typed is kept. The title is then trimmed.
    - Examples: `Buy #errand milk` → `Buy milk` + `errand`; `Call #mom, today` → `Call, today` + `mom`.
    - These stay plain title text: `C#` (no whitespace before `#`), a lone `#`, and a `#` token longer than 30 characters.
- **Edit:** clicking a task (or pressing Enter on it) opens an edit dialog (`<dialog>`) with all fields. Save validates the input and shows every error inline at once, next to its field (`aria-invalid` and `aria-describedby`). Cancel/Esc discards the changes.
- **Complete:** a checkbox toggles `completed` and sets or clears `completedAt`. Clicking the checkbox or a tag chip on a row does not open the edit dialog.
- **Delete:** available from the edit dialog and from the task's row menu. It deletes right away and shows a toast with **Undo** for 5 seconds.
  - Undo puts the task back in its original position, with every field identical (including `id`, `createdAt`, and `updatedAt`).
  - Only the most recent deletion can be undone. Deleting another task while the toast is showing makes the earlier deletion final, and the toast now offers Undo for the new one.
  - The 5-second timer pauses while the pointer is over the toast or keyboard focus is inside it, so keyboard users can reach **Undo**. After Undo, focus moves to the restored task.
  - After a delete, focus moves to the next task row, or to the previous one if there is no next, or to the list if it is now empty.

### 3.2 Due dates
- Set with `<input type="date">`, or leave empty.
- Each due date is labeled and styled by where it falls:
  - **Overdue:** before today and not completed. Shown in red text with the short date and an "Overdue" label (`Sep 25` · Overdue).
  - **Today:** styled to stand out, with a "Today" label.
  - **Upcoming:** after today. Shown as a relative date: "Tomorrow" for today + 1, the short weekday ("Fri") for today + 2 to today + 6, and the short date (`Oct 3`) from today + 7 on. The short date never shows the year, even in a different year.
  - **No date:** no label.
  - **Completed** tasks are never overdue. They show their short date with no status label.
- "Today" is the user's local calendar date. It is recomputed when the page regains focus after midnight.

### 3.3 Priorities
- Three levels, each with a colored badge or left border: high, medium, and low.
- **Default sort in the List view:**
  1. Incomplete before completed
  2. Due date ascending (tasks without a date last)
  3. Priority (high → low)
  4. `createdAt` ascending

  Completed tasks are sorted among themselves by the same keys.
- The user can also choose:
  - **Priority:** incomplete before completed → priority (high → low) → due date ascending (no date last) → `createdAt` ascending.
  - **Created:** incomplete before completed → `createdAt` descending (newest first).
- Every sort is stable: tasks that are equal on every key keep their stored order.
- The chosen sort is kept in UI state and saved (§2.4).

### 3.4 Categories & tags
- **Categories:** listed in the sidebar in their stored order, with a count of active tasks. The user can add, rename (inline), and delete them. A task has at most one category.
  - Adding or renaming to a name that is empty, longer than 40 characters, or already used (ignoring case) is rejected with a visible message. Renaming a category to a different case of its own name (`Work` → `WORK`) is allowed.
  - Renaming updates `category` (and `updatedAt`) on its tasks, and an active filter on it follows the new name. Esc cancels an inline rename.
  - Deleting a category that is the active filter also clears that filter.
- **Tags:** entered as a comma-separated list in the edit dialog, or with `#tag` in the quick-add text (e.g. `Buy milk #errand`). They show as chips on the task. The sidebar lists every tag used by any task, in alphabetical order, with a count of **active** tasks that have it. A tag used only by completed tasks is listed with count 0. A tag used by no task disappears.
- Clicking a category or tag in the sidebar, or a tag chip, filters to it. Clicking it again clears that filter. Only one category can be selected at a time; clicking another category replaces it.

### 3.5 Search & filter
- **Search:** case-insensitive substring match on title, notes, and tags. The list updates as you type, debounced by 150 ms.
  - The search text is trimmed first. Whitespace-only text means no search filter.
  - The text is matched literally (no regular expressions or wildcards). Case is folded with `toLowerCase()`, so `ÉTÉ` matches `été`.
- **Status filter:** All / Active / Completed. The default is Active.
- **Other filters:** category (one), tags (any number; a task must have all selected tags), and a calendar day (see §3.6).
- **Day filter:** selecting a day in the calendar sets the day filter. It shows as a removable chip and applies in both the List and Calendar views. Selecting the same day again, or removing its chip, clears it.
- All active filters combine with **AND**. A filter bar shows the active filters as removable chips, plus a "Clear all" button. The chips are: status (only when it isn't Active), category, each tag, day, and search text. The bar is hidden when no filter is active.
- If no tasks match, the view shows an empty state with a "Clear filters" action.
- "Clear all" and "Clear filters" reset every filter: status back to Active, no category, no tags, no day, and empty search.

### 3.6 Views
- **List view (default):** the filtered, sorted tasks. With the default sort, tasks are grouped under the headings *Overdue*, *Today*, *Upcoming*, *No date*, and *Completed*, in that order. Empty groups are not shown. The other sorts show one ungrouped list.
- The quick-add field at the top of the main area is shown in both views.
- **Calendar view:** a month grid (Mon–Sun, a setting can change the first day of the week to Sunday).
  - The grid has the fewest full weeks that cover the month: 4, 5, or 6 rows. Days from the previous and next months fill the first and last rows and are styled as outside the month.
  - Previous/next month buttons, plus a "Today" button.
  - Each day cell lists the tasks due that day (priority dot + title). If a day has more than 3 tasks, it shows "+N more".
  - Clicking a day selects it: a side or bottom panel lists that day's tasks and has a quick-add that sets `dueDate` to that day. Selecting a day from the previous or next month also moves the grid to that month.
  - In the calendar the day filter drives the panel, not the grid: the grid keeps showing every day, and the selected day is highlighted.
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
│               │  ── Sun, Sep 27 ─────────────────            │
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
  - Each task row is one tab stop. Its checkbox and tag chips are not tab stops (use `Space` on the row, and the sidebar tag filters). The row's "More actions" menu button is a tab stop; its menu has **Edit** and **Delete**, and `Esc` closes it.
  - Arrow keys move between days in the calendar grid: ←/→ by one day, ↑/↓ by one week. Moving past the first or last day of the month switches the grid to that month. Enter or Space selects the focused day.
- Shortcuts do nothing while the user is typing in a text field.
- Focus is visible everywhere. The edit dialog traps focus and returns it to the task when it closes.
- `aria-live="polite"` announces toasts and result counts.
- Colors meet WCAG AA contrast (4.5:1 for text).

## 6. Persistence & error handling

- Only `js/storage.js` reads and writes `localStorage`.
- Changes are saved after every state change, debounced by 200 ms, and flushed on `pagehide`.
- **Corrupt data:** if parsing, validation (§2.2), or migration (§2.3) fails, the app copies the raw value to `todo-planner:backup-<timestamp>`, starts with empty state, and shows a non-blocking warning. An existing backup is never overwritten.
- If the backup itself can't be written, the corrupt value is left in place, the app starts empty and doesn't save (so nothing is overwritten), and the warning says so.
- **Storage full** (`QuotaExceededError`): the app shows a persistent warning that changes may not be saved. It does not crash. The warning goes away after a later save succeeds.
- **Storage unavailable** (private mode or blocked): the app runs in memory and shows a banner.
- **Multiple tabs:** listen for the `storage` event and reload state when another tab writes (the last write wins).
  - An open edit dialog keeps its draft when another tab writes. Saving it overwrites that task (last write wins).
  - If the task being edited was deleted in another tab, the dialog closes and a toast says so. The draft is discarded.
- The app never reads, changes, or removes `localStorage` keys other than its own (`todo-planner:*`).

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
