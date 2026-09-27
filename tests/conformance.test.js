import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function listJs(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listJs(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

const JS_FILES = listJs('js');
const PURE = ['js/model.js', 'js/utils/date.js'];

/** Source with comments removed, so rules apply to code only. */
function code(path) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function offenders(files, pattern) {
  return files.filter((file) => pattern.test(code(file)));
}

test('AR-01 only storage.js touches localStorage or sessionStorage', () => {
  assert.deepEqual(offenders(JS_FILES, /\b(localStorage|sessionStorage)\b/), ['js/storage.js']);
});

test('AR-02 pure modules and the store never touch the DOM', () => {
  const files = [...PURE, 'js/store.js'];
  assert.deepEqual(offenders(files, /\b(document|window|querySelector\w*|addEventListener)\b/), []);
});

test('AR-03 pure modules never read the clock', () => {
  assert.deepEqual(offenders(PURE, /Date\.now\(|new Date\(\)|performance\.now\(/), []);
});

test('AR-04 no date-only string is parsed with Date', () => {
  assert.deepEqual(offenders(JS_FILES, /(new Date|Date\.parse)\(\s*['"`]\d{4}-\d{2}-\d{2}['"`]/), []);
  assert.deepEqual(offenders(JS_FILES, /new Date\(\s*['"]/), []);
});

test('AR-05 HTML sinks only take static strings', () => {
  const sink = /(\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\()\s*([^;]*)/g;
  const bad = [];
  for (const file of JS_FILES) {
    for (const match of code(file).matchAll(sink)) {
      const value = match[2].trim();
      const staticString = /^'[^']*'/.test(value) || /^"[^"]*"/.test(value)
        || (/^`[^`]*`/.test(value) && !/^`[^`]*\$\{/.test(value));
      if (!staticString) bad.push(`${file}: ${match[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('AR-06 no var declarations', () => {
  assert.deepEqual(offenders(JS_FILES, /\bvar\s/), []);
});

test('AR-07 no default exports', () => {
  assert.deepEqual(offenders(JS_FILES, /export\s+default\b/), []);
});

test('AR-08 imports are relative and end in .js', () => {
  const bad = [];
  for (const file of JS_FILES) {
    for (const match of code(file).matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1] ?? match[2];
      if (!/^\.\.?\//.test(specifier) || !specifier.endsWith('.js')) bad.push(`${file}: ${specifier}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('AR-09 index.html loads js/main.js as a module and nothing from a CDN', () => {
  const html = read('index.html');
  assert.match(html, /<script\s+type="module"\s+src="js\/main\.js"><\/script>/);
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/main.js']);
  assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//);
});

test('AR-10 package.json has no dependencies', () => {
  if (!existsSync(join(ROOT, 'package.json'))) return;
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
});

test('AR-11 every module under js/ is listed in CLAUDE.md', () => {
  const claude = read('CLAUDE.md');
  const layout = claude.slice(claude.indexOf('## Directory layout'), claude.indexOf('## Coding conventions'));
  const missing = JS_FILES.filter((file) => !layout.includes(relative(ROOT, join(ROOT, file))));
  assert.deepEqual(missing, []);
});

test('AR-12 styles use custom properties, a dark scheme, and the 720px breakpoint', () => {
  const css = read('css/styles.css');
  assert.match(css, /:root\s*\{[^}]*--[\w-]+\s*:/);
  assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(css, /@media\s*\(min-width:\s*720px\)/);
});

test('AR-13 no eval, new Function, or document.write', () => {
  assert.deepEqual(offenders(JS_FILES, /\beval\(|new Function\(|document\.write\(/), []);
});
