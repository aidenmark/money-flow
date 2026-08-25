import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recurringPaydays, nthWeekdayOf, chequesInWindow, shareOfBill,
  livingRates, payoff, affordability, cushionTarget, DAYS_IN_MONTH,
} from '../src/money.js';

const d = (y, m, day) => new Date(y, m - 1, day);

test('recurringPaydays walks forward from the anchor on the given cycle', () => {
  const out = recurringPaydays(d(2026, 8, 14), 14, d(2026, 8, 1), d(2026, 9, 30));
  assert.deepEqual(out.map(x => x.getDate()), [14, 28, 11, 25]);
});

test('recurringPaydays includes an anchor that is itself in range', () => {
  const out = recurringPaydays(d(2026, 8, 14), 14, d(2026, 8, 14), d(2026, 8, 14));
  assert.equal(out.length, 1);
});

test('recurringPaydays rejects a non-positive cycle rather than looping forever', () => {
  assert.throws(() => recurringPaydays(d(2026, 8, 14), 0, d(2026, 8, 1), d(2026, 9, 1)), RangeError);
});

test('nthWeekdayOf finds the third Wednesday', () => {
  const t = nthWeekdayOf(2026, 7, 3, 3);          // August 2026
  assert.equal(t.getDate(), 19);
  assert.equal(t.getDay(), 3);
});

test('nthWeekdayOf handles a month starting on the target weekday', () => {
  const t = nthWeekdayOf(2026, 3, 1, 3);          // April 2026 starts on a Wednesday
  assert.equal(t.getDate(), 1);
});

test('a bill splits across every cheque in its window, not just those remaining', () => {
  const income = { anchor: d(2026, 8, 14), every: 14 };
  const windowCheques = chequesInWindow(d(2026, 8, 1), d(2026, 8, 31), income);
  assert.equal(windowCheques, 2);                  // the 14th and the 28th

  // Opened on the 25th, only one cheque is left — but the bill still owes half.
  const { perCheque, parts, carried } = shareOfBill(1750, windowCheques, 1);
  assert.equal(parts, 2);
  assert.equal(perCheque, 875);
  assert.equal(carried, true);
});

test('shareOfBill never divides by fewer cheques than it is assigning rows to', () => {
  const { parts } = shareOfBill(300, 1, 3);
  assert.equal(parts, 3);
});

test('shareOfBill survives a zero window rather than dividing by zero', () => {
  const { perCheque } = shareOfBill(100, 0, 2);
  assert.equal(perCheque, 50);
});

test('livingRates converts monthly costs to a daily burn', () => {
  const r = livingRates(1500, 300);
  assert.equal(r.dayRate, 1500 / DAYS_IN_MONTH);
  assert.ok(Math.abs(r.dayRate - 49.3) < 0.2);
});

const CARDS = [
  { name: 'Card A', balance: 4000, apr: 0.27 },
  { name: 'Card B', balance: 2000, apr: 0.24 },
];

test('payoff clears the debt and reports when', () => {
  const r = payoff(CARDS, 1000);
  assert.equal(r.stalled, false);
  assert.ok(r.months > 0 && r.months < 12);
  assert.ok(r.interest > 0);
  assert.equal(r.series[0].total, 6000);
  assert.ok(r.series.at(-1).total < 0.01);
});

test('payoff attacks the highest rate first', () => {
  const r = payoff(CARDS, 1000);
  const a = r.cards.find(c => c.name === 'Card A');
  const b = r.cards.find(c => c.name === 'Card B');
  assert.ok(a.clearedIn <= b.clearedIn);
});

test('missing one month in three costs more than the payment that was missed', () => {
  const steady = payoff(CARDS, 600);
  const patchy = payoff(CARDS, 600, 3);
  assert.ok(patchy.months > steady.months);
  assert.ok(patchy.interest > steady.interest);
});

test('a payment below the interest never clears, and says so', () => {
  const r = payoff(CARDS, 10);
  assert.equal(r.stalled, true);
});

test('payoff does not mutate the caller data', () => {
  const before = structuredClone(CARDS);
  payoff(CARDS, 900);
  assert.deepEqual(CARDS, before);
});

const BASE = {
  balance: 700, incoming: 0, billsDue: 0, commitments: 0,
  days: 5, dayRate: 50, irrRate: 12, amount: 100,
};

test('affordability says yes with room to spare', () => {
  assert.equal(affordability(BASE).verdict, 'yes');
});

test('affordability says no once the bills are counted', () => {
  assert.equal(affordability({ ...BASE, billsDue: 500 }).verdict, 'no');
});

test('affordability calls it tight in the narrow band above zero', () => {
  // free lands just above the purchase price but under the $50 comfort margin
  const r = affordability({ ...BASE, balance: 450 });
  assert.equal(r.verdict, 'tight');
  assert.ok(r.after >= 0 && r.after < 50);
});

test('affordability counts money arriving inside the horizon', () => {
  const poor = affordability({ ...BASE, balance: 100 });
  const paid = affordability({ ...BASE, balance: 100, incoming: 900 });
  assert.equal(poor.verdict, 'no');
  assert.equal(paid.verdict, 'yes');
});

test('cushionTarget is three months of irregular spending, rounded', () => {
  assert.equal(cushionTarget(360), 1100);
  assert.equal(cushionTarget(100), 300);
});
