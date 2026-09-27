# CLAUDE.md — To-do Planner

## Project summary

A browser-only to-do planner with due dates, a calendar view, priorities, categories and tags, and search and filter. Data is stored in `localStorage`.

**`docs/spec.md` is the source of truth** for behavior, the data model, and acceptance criteria. Read it before starting a feature. If an implementation changes behavior, update the spec in the same change.

## Stack rules

- Use plain HTML, CSS, and JavaScript **ES modules** only.
- Don't add frameworks, bundlers, transpilers, or npm runtime dependencies.
- The app is `index.html` plus static files. It must run as-is from any static file server.
- Target current evergreen browsers. Modern features such as `<dialog>`, `crypto.randomUUID()`, and CSS nesting and custom properties are fine.

## Directory layout

```
index.html
css/styles.css
js/main.js            # bootstrap, global event wiring
js/store.js           # state, dispatch(action), subscribe(fn)
js/storage.js         # localStorage load/save/migrate (only module touching storage)
js/model.js           # pure: createTask, validateTask, filterTasks, sortTasks, groupTasks, parseQuickAdd
js/utils/date.js      # pure date helpers (local YYYY-MM-DD)
js/views/list.js
js/views/calendar.js
js/views/sidebar.js
tests/                # node --test unit tests for pure modules
docs/spec.md
docs/test-case.md     # required test cases, traced to spec §8
```

Keep this layout. If you add a module, add it here too.

## Coding conventions

- Use 2-space indentation, semicolons, and single quotes. Use `const` by default and `let` only when a variable is reassigned. Never use `var`.
- Use camelCase for variables and functions, PascalCase only for classes (avoid classes unless they help), and kebab-case for CSS classes and file names.
- Use named exports and no default exports.
- **Layering:**
  - `model.js` and `utils/date.js` are pure. They must not touch the DOM or storage and must not read the clock. Pass `today` in as an argument.
  - Only `storage.js` touches `localStorage`.
  - Only `js/views/*` and `main.js` touch the DOM.
  - State changes go through `dispatch`. Never mutate state in place; return new objects and arrays.
- **Security:** never put user text into `innerHTML`. Build elements and set `textContent`. The only `innerHTML` allowed is static template strings with no user data in them.
- **Dates:** due dates are local `YYYY-MM-DD` strings. Parse, compare, and format them only with `utils/date.js`. Never use `new Date('YYYY-MM-DD')`, because it parses the string as UTC.
- **CSS:** put theme colors in custom properties on `:root`, and put dark-theme values in `@media (prefers-color-scheme: dark)`. Design mobile-first; the sidebar breakpoint is 720px.
- **Accessibility:** the requirements in spec §5 are required, not optional. Use real buttons and inputs, labels or `aria-label`, and visible focus.
- Keep functions small. Add comments only where the *why* isn't obvious.

## Running locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000   # or: npx serve .
# open http://localhost:8000
```

The devcontainer (`.devcontainer/devcontainer.json`) currently has **neither Python nor Node**. When you need one, add a devcontainer feature and rebuild. For example:

```json
"features": { "ghcr.io/devcontainers/features/node:1": {} }
```

## Testing

- **`docs/test-case.md` lists the required test cases** (unit, conformance, and end-to-end) with IDs traced to spec §8. Implement the automated ones in `tests/`, put the test ID in each test name, and run the matching `E-` cases for UI changes. Its §2 lists spec gaps and the assumptions the tests make; resolve them in `docs/spec.md` rather than guessing.
- Unit-test the pure modules (`model.js`, `utils/date.js`, and the migration functions in `storage.js`) with Node's built-in test runner. Don't add test dependencies.
  ```sh
  node --test tests/
  ```
- Name test files `tests/<module>.test.js` and import with relative paths, e.g. `../js/model.js`.
- Cover edge cases: empty or long titles, tag normalization, sort ties, month grids across month and year boundaries, and overdue exactly at midnight.
- For UI changes, walk through the matching acceptance criteria in `docs/spec.md` §8 by hand in a browser, in both light and dark themes and at 360px width.

## Git workflow

- The default branch is `main`. Work on feature branches (`feat/calendar-view`, `fix/overdue-midnight`) and never commit straight to `main`.
- Make small, focused commits with imperative subjects (`Add calendar month grid`) of 72 characters or less.
- Don't commit generated files, `node_modules/`, or editor settings.

## Definition of done

- [ ] The behavior matches `docs/spec.md`, and the spec is updated if behavior changed.
- [ ] `node --test tests/` passes.
- [ ] No console errors or warnings during normal use.
- [ ] Works with the keyboard alone, at 360px width, and in light and dark themes.
- [ ] Data persists across a reload, and the stored schema is unchanged or migrated.
