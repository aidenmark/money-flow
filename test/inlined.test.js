import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The page ships as one file, so the logic has to be inlined rather than
 * imported. That is a copy, and copies drift — so the copy is generated, and
 * this test fails the moment index.html stops matching src/money.js.
 */
test('index.html is in step with src/money.js', () => {
  execFileSync('node', [join(root, 'tools/inline.js'), '--check'], { stdio: 'pipe' });
});

test('the page calls the shared core rather than keeping its own copy', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const call of ['Core.payoff(', 'Core.affordability(', 'Core.livingRates(',
                      'Core.cushionTarget(', 'Core.recurringPaydays(']) {
    assert.ok(html.includes(call), `expected the page to call ${call}`);
  }
});
