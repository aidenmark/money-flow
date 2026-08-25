/**
 * Inlines src/money.js into index.html.
 *
 * The shipped artifact must stay a single file that runs from file:// with no
 * server — and ES module imports are blocked over file://, so the logic cannot
 * simply be <script type="module" src="...">. Rather than keep two hand-edited
 * copies and hope they stay in step, src/money.js is the single source of truth
 * and this writes it into the marked region of index.html.
 *
 *   node tools/inline.js         # rewrite the region
 *   node tools/inline.js --check # exit 1 if the page is out of date
 *
 * test/inlined.test.js runs the --check path, so drift fails the suite.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '/* === inlined from src/money.js — regenerate with `npm run build` === */';
const END = '/* === end src/money.js === */';

/** Strip module syntax and wrap as a namespaced IIFE the page can call. */
export function buildBlock(moduleSource) {
  const names = [...moduleSource.matchAll(/export (?:function|const) (\w+)/g)].map(m => m[1]);
  const body = moduleSource
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')          // drop the module-level docblock
    .replace(/\bexport /g, '');
  return `${START}\nconst Core = (function(){\n${body}\nreturn {${names.join(', ')}};\n})();\n${END}`;
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const block = buildBlock(readFileSync(join(root, 'src/money.js'), 'utf8'));

const i = html.indexOf(START);
const j = html.indexOf(END);
if (i === -1 || j === -1) {
  console.error('index.html has no inline region — add the START/END markers first.');
  process.exit(2);
}
const current = html.slice(i, j + END.length);
const next = html.slice(0, i) + block + html.slice(j + END.length);

if (process.argv.includes('--check')) {
  if (current !== block) {
    console.error('index.html is out of date with src/money.js — run `npm run build`.');
    process.exit(1);
  }
  console.log('index.html is in step with src/money.js');
} else {
  writeFileSync(join(root, 'index.html'), next);
  console.log(current === block ? 'already in step' : 'index.html updated from src/money.js');
}
