/**
 * Money Flow — the pure logic.
 *
 * Everything here is a total function of its inputs: no DOM, no storage, no
 * clock. The dashboard is a single self-contained HTML file by design (it holds
 * a complete financial picture, so it must run offline with no server and no
 * dependency supply chain), but the arithmetic that matters is extracted here so
 * it can be tested independently of the page that draws it.
 *
 * @module money
 */

/** Milliseconds in a day. */
const DAY = 86400000;
/** Average days in a month. Pay cycles are in days, bills are monthly. */
export const DAYS_IN_MONTH = 365 / 12;

/** @typedef {{date: Date, amount: number}} Payday */

/**
 * Paydays for an income that repeats every N days, from an anchor date.
 * @param {Date} anchor  a known payday
 * @param {number} every days between paydays
 * @param {Date} from    inclusive start
 * @param {Date} to      inclusive end
 * @returns {Date[]}
 */
export function recurringPaydays(anchor, every, from, to) {
  if (every <= 0) throw new RangeError('every must be positive');
  const out = [];
  let d = new Date(anchor);
  while (d < from) d = new Date(d.getTime() + every * DAY);
  while (d <= to) { out.push(new Date(d)); d = new Date(d.getTime() + every * DAY); }
  return out;
}

/**
 * The nth given weekday of a month — "the third Wednesday" and similar.
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {number} n      1 = first
 * @param {number} weekday 0 = Sunday
 * @returns {Date}
 */
export function nthWeekdayOf(year, month, n, weekday) {
  const first = new Date(year, month, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + shift + (n - 1) * 7);
}

/**
 * How many paydays a bill's funding window ORIGINALLY held, including any that
 * have already passed.
 *
 * This is the subtle one. A monthly bill is funded by setting aside a share from
 * each payday in its window. Divide by only the paydays that REMAIN and opening
 * the app mid-month piles a whole month's rent onto one cheque — the app appears
 * to demand money that was, in reality, already set aside weeks ago. Dividing by
 * the full window keeps each cheque responsible for its own share.
 *
 * @param {Date} from   window start
 * @param {Date} to     window end
 * @param {{anchor: Date, every: number}} income
 * @returns {number}
 */
export function chequesInWindow(from, to, income) {
  return recurringPaydays(income.anchor, income.every, from, to).length;
}

/**
 * Split an amount across the cheques still ahead, using the full window as the
 * divisor.
 * @returns {{perCheque: number, parts: number, carried: boolean}}
 */
export function shareOfBill(amount, windowCheques, remainingCheques) {
  const parts = Math.max(remainingCheques, windowCheques || remainingCheques, 1);
  return {
    perCheque: amount / parts,
    parts,
    carried: parts > remainingCheques,
  };
}

/**
 * Daily rates for spending that has no due date — groceries, fuel, coffee — plus
 * the irregular-but-certain costs (repairs, replacements, gifts) that appear on
 * no bill at all. Omitting the second group is what makes a budget balance on
 * paper and fail in practice.
 * @param {number} monthlyLiving
 * @param {number} monthlyIrregular
 */
export function livingRates(monthlyLiving, monthlyIrregular) {
  return {
    daily: monthlyLiving,
    irregular: monthlyIrregular,
    dayRate: monthlyLiving / DAYS_IN_MONTH,
    irrRate: monthlyIrregular / DAYS_IN_MONTH,
  };
}

/**
 * Amortise revolving debt at a fixed monthly payment, highest APR first.
 *
 * `skipEvery` models the real failure mode: a payment missed every Nth month
 * because something unplanned had to be paid instead. Interest does not pause
 * while you catch up, which is why consistency beats size.
 *
 * @param {{name: string, balance: number, apr: number}[]} cards
 * @param {number} monthly
 * @param {number} [skipEvery] miss the payment every Nth month
 * @param {number} [cap] iteration guard
 * @returns {{months: number, interest: number, stalled: boolean, cards: object[], series: {month: number, total: number}[]}}
 */
export function payoff(cards, monthly, skipEvery = 0, cap = 400) {
  const work = cards
    .map(c => ({ ...c, bal: c.balance, clearedIn: null }))
    .sort((a, b) => b.apr - a.apr);
  const total = () => work.reduce((s, c) => s + Math.max(0, c.bal), 0);

  let interest = 0, months = 0;
  const series = [{ month: 0, total: total() }];

  while (work.some(c => c.bal > 0.01) && months < cap) {
    months++;
    for (const c of work) {
      if (c.bal > 0) { const i = c.bal * c.apr / 12; c.bal += i; interest += i; }
    }
    let pot = (skipEvery && months % skipEvery === 0) ? 0 : monthly;
    for (const c of work) {
      const pay = Math.min(c.bal, pot);
      c.bal -= pay; pot -= pay;
      if (c.bal <= 0.01 && c.clearedIn === null) c.clearedIn = months;
    }
    series.push({ month: months, total: total() });
  }
  return { months, interest, stalled: months >= cap, cards: work, series };
}

/**
 * Can this purchase be afforded over a given horizon?
 *
 * Deterministic on purpose. The question is arithmetic against data the app
 * already holds, so it needs no network call and cannot invent a balance.
 *
 * @param {object} o
 * @param {number} o.balance        what is in the account now
 * @param {number} o.incoming       money arriving inside the horizon
 * @param {number} o.billsDue       unpaid bills that must still leave this balance
 * @param {number} o.commitments    fixed expenses inside the horizon
 * @param {number} o.days           days the horizon covers
 * @param {number} o.dayRate        ordinary living cost per day
 * @param {number} o.irrRate        irregular set-aside per day
 * @param {number} o.amount         the price of the thing
 * @returns {{free: number, after: number, verdict: 'yes'|'tight'|'no'}}
 */
export function affordability(o) {
  const living = o.dayRate * o.days;
  const irregular = o.irrRate * o.days;
  const free = o.balance + o.incoming - o.billsDue - o.commitments - living - irregular;
  const after = free - o.amount;
  return {
    free,
    after,
    verdict: after >= 50 ? 'yes' : after >= 0 ? 'tight' : 'no',
  };
}

/**
 * The buffer target: three months of irregular spending, rounded.
 *
 * Three months is enough to absorb one real hit — a repair, a dental bill — and
 * still have something left for whatever follows. It is a total to reach and
 * hold, not a per-paycheck figure.
 */
export function cushionTarget(monthlyIrregular, roundTo = 50) {
  return Math.round(monthlyIrregular * 3 / roundTo) * roundTo;
}
