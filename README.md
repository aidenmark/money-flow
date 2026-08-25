# Money Flow

A personal finance dashboard that runs from **one HTML file, offline, with no
dependencies and no build step**.

Seven pages, a dozen charts drawn from scratch in SVG, and a scheduler that turns
a pay cycle and a pile of due dates into an answer to the only question that
matters day to day: *what can I actually spend right now?*

**[Live demo](#)** · every figure in it is fictional.

---

## Why it is built this way

The file holds someone's complete financial picture — income, rent, debts,
a household member's benefit. That single fact drove every architectural
decision:

| Constraint | Consequence |
|---|---|
| The data must never leave the machine | No server, no API, no telemetry, no analytics |
| It must work with no internet | No CDN, no runtime dependencies |
| It must survive neglect | No runtime toolchain to rot, no lockfile to bit-rot |
| It must be auditable by its owner | One file they can read, copy, and back up |

The result is unusual — 200KB of HTML with inline CSS and JavaScript — and it is
a deliberate trade, not an accident. What it costs is module boundaries and a
component framework. What it buys is a document that will still open in ten
years, from a USB stick, on a plane.

### Keeping one file and one source of truth

The **logic worth testing does not need the DOM**, so it lives in
[`src/money.js`](src/money.js) — the payday scheduler, the funding-window
divisor, the debt amortiser and the affordability calculator.

That creates the obvious problem: the page ships as a single file and **ES module
imports are blocked over `file://`**, so it cannot simply `import` the module. The
lazy answer is two hand-maintained copies, which drift the first time anyone is in
a hurry.

Instead the module is the source of truth and is **generated into** the page:

```bash
npm run build     # write src/money.js into the marked region of index.html
npm test          # --check that it is in step, then run the suite
```

[`tools/inline.js`](tools/inline.js) does the write; `npm test` runs its `--check`
path first, so **a drifted page fails the suite** rather than shipping. A second
test asserts the page actually calls `Core.payoff`, `Core.affordability` and the
rest, so the inlined copy cannot quietly become decorative while the page keeps a
private duplicate.

The page keeps thin adapters — it knows about `MONEY`, the DOM and the clock; the
core knows only numbers:

```js
function livingRates(){
  return Core.livingRates(
    MONEY.living.reduce((s,x)=>s+x[1], 0),
    CUSHION.absorbs.reduce((s,a)=>s+a[1], 0));
}
```

21 tests, zero dependencies, `node --test`.

---

## The problems that were actually hard

### 1. A budget that balances on paper and fails in life

The first version modelled every bill correctly and still could not explain why
the month came up short. The gap was **spending with no due date** — groceries,
fuel, coffee — and, worse, *irregular certainties*: replacing skincare, a set of
tyres, a dental bill, a birthday. Each is certain to happen and none of them has
a date, so a scheduler built around due dates cannot see any of them.

They are now first-class (`MONEY.living`, and the cushion's absorb list) and are
funded per-day like anything else. This single change is the difference between a
plan that looks affordable and one that survives contact with a month.

### 2. The mid-month divisor bug

A monthly bill is funded by setting a share aside from each payday in its window.
The obvious implementation divides by the paydays that **remain**:

```js
const share = bill.amount / remainingPaydays.length;   // wrong
```

Open the app on the 25th and one cheque is asked to absorb an entire month's
rent — money that was, in reality, already set aside on the 1st and the 14th. The
app demanded money that had already been paid.

The fix divides by the paydays the window **originally held**, and assigns rows
only to those still ahead:

```js
const parts  = Math.max(remaining, windowCheques || remaining, 1);
const share  = bill.amount / parts;
const carried = parts > remaining;   // earlier cheques already did their part
```

See `shareOfBill` and `chequesInWindow`. This is the test I would point at first.

### 3. "Can I afford this?" without a language model

The obvious build is a chatbot. It was the wrong tool three times over: it would
have to send balances to an API (breaking the one constraint that drove the whole
design), it would cost money per question, and it could hallucinate a number.

The question — *can I afford £100 today, this week, or this month?* — is
arithmetic over data the app already holds. `affordability()` is 12 lines, exact,
instant, offline, and when the answer is no it can name the specific lever that
would change it. A deterministic function was the better engineering answer, not
the more conservative one.

### 4. Colour that survives colour-blindness

Seven categorical colours across a donut, a calendar and a dozen bars, in both a
light and a dark appearance. Hand-picking failed: the first palette I chose by eye
failed four of six checks — lightness band, chroma floor, CVD separation, and the
normal-vision floor.

The palette is now **chosen by search and verified by script** against both
surfaces (OKLCH lightness band, chroma floor, ΔE separation under simulated
protanopia and deuteranopia, and WCAG contrast). The slot *order* is the safety
mechanism, because adjacent slices are the pairs that must stay distinguishable —
so the order is documented as load-bearing and is never reshuffled for taste.

---

## What is in it

| Page | Form | Why that form |
|---|---|---|
| **Snapshot** | KPI strip + widget grid | The only page whose job is breadth |
| **Today** | A day-by-day runway | A stretch of days is a line, not a pie |
| **Paycheck** | A waterfall | A cheque is a sequence of claims, each starting where the last finished |
| **Spending** | Donut, bill calendar, line-by-line | Composition, timing, and detail are three different questions |
| **Cushion** | A stepped fill curve | The money arrives in lumps; a smooth curve would lie |
| **Debt** | Shrink line + principal vs interest | Shows how much of a payment is progress and how much is rent |
| **Can I afford it?** | Question, verdict, working | An answer you can check |

No component is reused across pages. Sameness reads as flatness, and a dashboard
where every page opens identically teaches you to stop looking.

Other things worth a look: the **bill calendar**, which plots each bill on its due
day and makes visible that bills *cluster* — a sorted list tells you what is big,
but not that the 24th to the 30th is a wall; and **plan-versus-actual**, which
hides its trend chart until two months are logged rather than drawing a line
through one point.

---

## Running it

```bash
git clone https://github.com/aidenmark/money-flow && cd money-flow
open index.html          # that is the whole install step — no npm install
npm test                 # optional: 21 tests, no dependencies
```

Tested in Chrome and Safari, at 1512 / 1024 / 700 / 430px, in both appearances.

## Licence

MIT. The data in the demo is fictional.
