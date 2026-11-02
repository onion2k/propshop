# Market regimes

State: landed on main at 82550af, 2026-11-02.

## Context

Every day is the same kind of day, so whatever block worked yesterday works today and the player never has
to think. Real markets have moods: a quiet drift, a trend that runs all session, a jittery chop, a day of
headlines. Giving each day one, named, makes switching blocks a decision and gives the day report a reason.

## What is built

- **Regimes are content:** `src/content/regimes.ts` lists them with a weight, a name, an explainer and the
  multipliers: on the fair value's hourly wander, on the jump rate and size, on the news rate and size, and
  a drift in basis points over the day, signed per stock. Four: calm, trending, choppy, news-heavy.
- **The day's regime is a function of the seed and the day,** so it is known ahead for the news engine,
  which schedules a day in advance, and the same for a save as for the game it came from. The game hands
  the market the day's regime at the open, with a drift sign per stock drawn then; the market scales its
  wander, jumps and drift by it; the news engine scales how many headlines it draws for a day and how big.
- **The top bar** names the day from the open, with the explainer on hover; **the day report** records it;
  a **glossary** entry explains what to do about each.

## Parts

- [x] 1. The regime type, content, the function of seed and day, the market's and news engine's use of it;
      tests that a choppy day has more gaps than a calm one, a news-heavy day more headlines, a trending
      day a drift, and that a save keeps it.
- [x] 2. The top bar and the report; a UI test.

## Verification

`npm run check` green. The pacing harness on a calm and a choppy seed shows arbitrage earning more on the
choppy one. In the browser the top bar names the day.
