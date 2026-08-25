import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

/**
 * MONEY.spend.categories restates figures that also live in MONEY.bills and
 * MONEY.living. The duplication is deliberate — the grouping and the
 * locked/flex/temp flag are real extra information, and the file is meant to be
 * edited by hand, so a derived structure would be harder to read than the
 * problem it solves.
 *
 * What is not acceptable is the failure being silent. Change a bill, forget the
 * category, and the donut simply disagrees with the plan by a few dollars with
 * nothing raised. These tests make that a failing build instead.
 */
const slice = (from, to) => html.slice(html.indexOf(from), html.indexOf(to));
const unescape = s => s.replace(/&amp;/g, '&');

function categoryItems() {
  const out = {};
  for (const cat of slice('spend:{', 'cards:[').matchAll(
    /\{name:(['"])(.*?)\1,\s*own:'\w+',\s*items:\[(.*?)\]\}/gs)) {
    for (const it of cat[3].matchAll(/\['([^']*)',([\d.]+),'(\w+)'\]/g)) {
      out[unescape(it[1])] = { amount: Number(it[2]), flag: it[3], category: cat[2] };
    }
  }
  return out;
}

const bills = Object.fromEntries([...slice('bills:[', 'care:[')
  .matchAll(/\{name:'([^']*)',\s*amount:([\d.]+)/g)]
  .map(m => [unescape(m[1]), Number(m[2])]));

const living = Object.fromEntries([...slice('living:[', 'alreadyHandled')
  .matchAll(/\['([^']*)',\s*([\d.]+)\]/g)]
  .map(m => [unescape(m[1]), Number(m[2])]));

test('the data parses at all', () => {
  assert.ok(Object.keys(bills).length > 5, 'expected to find bills');
  assert.ok(Object.keys(living).length > 3, 'expected to find living costs');
  assert.ok(Object.keys(categoryItems()).length > 15, 'expected to find category lines');
});

test('every bill appears in a category, at the same amount', () => {
  const cats = categoryItems();
  for (const [name, amount] of Object.entries(bills)) {
    assert.ok(cats[name], `"${name}" is a bill but appears in no category`);
    assert.equal(cats[name].amount, amount,
      `"${name}": bills says ${amount}, ${cats[name].category} says ${cats[name].amount}`);
  }
});

test('every living cost appears in a category, at the same amount', () => {
  const cats = categoryItems();
  for (const [name, amount] of Object.entries(living)) {
    assert.ok(cats[name], `"${name}" is a living cost but appears in no category`);
    assert.equal(cats[name].amount, amount,
      `"${name}": living says ${amount}, ${cats[name].category} says ${cats[name].amount}`);
  }
});

test('a category line is flagged locked, flex or temp', () => {
  for (const [name, { flag }] of Object.entries(categoryItems())) {
    assert.ok(['locked', 'flex', 'temp'].includes(flag), `"${name}" has flag "${flag}"`);
  }
});

test('no category line is duplicated across two categories', () => {
  const seen = new Map();
  for (const cat of slice('spend:{', 'cards:[').matchAll(
    /\{name:(['"])(.*?)\1,\s*own:'\w+',\s*items:\[(.*?)\]\}/gs)) {
    for (const it of cat[3].matchAll(/\['([^']*)',[\d.]+,'\w+'\]/g)) {
      const n = unescape(it[1]);
      assert.ok(!seen.has(n), `"${n}" appears in both ${seen.get(n)} and ${cat[2]}`);
      seen.set(n, cat[2]);
    }
  }
});
