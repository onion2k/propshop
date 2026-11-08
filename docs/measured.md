# What has been measured

The figures behind `CLAUDE.md`'s "What is not held": what was measured, when, and how. Nothing holds them; each
was true on its date and may have moved since. A new measurement goes here, under its subject, with its date
and the command or script that took it. Moved here from `CLAUDE.md` on 2026-11-08, at commit `d20c8e3`.

## The economy

Measured by the PACE harness (`test/pace.test.ts`) and tuned by hand. A run of
`PACE=1 PACE_MINUTES=20 npx vitest run test/pace.test.ts` takes about ten minutes.

- 2026-11-08, whole days through the store (`test/nightpace.test.ts`, three seeds, three trading days, a new
  player who leaves the starting setup alone): home momentum made, dollars a day, seed 1: 990, 15,985, 5,639;
  seed 2: 579, 1,502, 15,349; seed 3: -69, 5,431, 5,907. About 5,700 a day on average, so the 18,000 first rung
  is about three days of it. The PACE harness on the same day, one hour after the open of three seeds scaled to
  a day, read home momentum 339 (93, 496, 429) and city momentum 599 (159, 1,955, -316): the first hour is
  momentum's weakest, and scaling it to a day understates a day by more than ten times. Use whole days for
  momentum's pace.
- 2026-11-08, the PACE harness on seed 1, twenty minutes, before and after instruments (`plans/instruments.md`),
  identical to the dollar, dollars a day: home momentum -218; colocated arbitrage 8,395; colocated maker 6,962,
  and 28,647 at no half-spread; colocated pairs -1,006; city arbitrage with the maker 4,251; the hand from home
  -83,604; Harbor Quant 14,542 while the hand sweeps. Colocated index arbitrage made no fill at all, where on
  2026-11-02 it fired a few hundred times an hour: not looked into.
- The figures below are from before chance was split into streams (2026-11-06), which changed every draw. One
  seed at twenty minutes since, dollars a day: home momentum -200 (was 2,200); colocated arbitrage 8,400;
  Harbor Quant 14,900; the maker positive everywhere (home 1,600, colocated 7,000, city 4,800); city momentum
  -300; city arbitrage -1,700, and 190 held near; mean reversion -5,000 to -10,600.
- What each setup earned on 2026-11-02 on the twelve-stock universe, dollars a day over three seeds: home
  momentum 2,200; home arbitrage about nought; colocated arbitrage 6,900; the fastest rival 11,000; the
  colocated maker 3,300 at two cents and 38,000 joining the touch on every book; pairs 600 colocated; mean
  reversion -4,000 to -10,000; index arbitrage fires a few hundred times an hour from a rack and loses about
  a thousand on scratched legs.
- From home the laptop runs one block and only momentum earns, so the first rung of the shop (city office,
  leased fibre, server) is priced at 18,000 together, so the first latency lesson comes early. Colocation and
  the links keep their weight. Measured on 2026-11-04 from the city, dollars a day over three seeds: momentum
  2,600; the maker 1,900; arbitrage -400, and 200 held to gaps within ten milliseconds; arbitrage with the
  maker 1,300. The city teaches that a few miles is not colocation.
- The market maker is near break-even and lives by the day's regime: about -900 dollars a day over three
  seeds at home and colocated, with a calm day positive and a trending day not. It reads the book without
  its own orders in it (`touchExcluding`); what it still cannot beat is the fastest bot taking a quote in
  the tick before its cancel lands.
- Hand trading is a measured loser, as the desk is meant to show. One seed, twenty minutes, dollars a day: a
  person at the desk sending momentum's calls as 2,000-share market orders from home loses about 23,000, and
  65,000 to 134,000 at 5,000 shares; Harbor Quant earns 8,000 to 11,000 more a day while a 2,000-share hand is
  sweeping, because the sweep opens gaps that the arbitrage firms race for. The crowd's visible top is mostly
  2,000 shares or more, so a 2,000-share order fits one exchange and only 5,000 sweeps.
- Chasing a sweep's print (`anticipate`) loses here, however it is cut: -27,000 to -165,000 a day across five
  designs, and the rival Shadow Trading runs the jump alone, near nought. The first child's print comes from
  PACIFIC, whose data takes 15 ms to reach even racks at every exchange; a slow trader's children spread over
  about 20 ms; and with a cleared-level trigger and a one-tick FPGA the chaser was still second in 32 of 43
  races. The jump on a large single resting order (`largest` in the depth) is about break-even.

## The futures desk

- 2026-11-08, how far the near future, carried back to today, is past the index's touch, sampled every 100 ms over
  twenty minutes of three seeds' opens with no firm trading it: median 0.16 to 0.34 cents; over half a cent about
  18% of the time, over a cent about 1.5%, over two almost never (2.35 at most). So the blocks trade at half a cent
  or not at all: lead-lag's default is 0.5.
- The PACE harness, three seeds, twenty minutes, dollars a day, with Prairie Partners (a rack at the Prairie Board,
  microwave, lead-lag at 0.5 cents and 3,000 shares): lead-lag from home 737 (463 to 1,335); from a rack at the
  Prairie Board on fibre 919; from a rack at Lakeside on microwave 1,290; from a rack at the Prairie Board on
  microwave 1,515 (1,351 to 1,807); the rival itself 924. The ladder is the lesson's, but the plan's check is not
  met: a rack and microwave beat home by about 780 a day, and microwave alone is 120,000, about 150 days of it.
  What would widen it is how slowly the index's books follow (one to two and a half seconds, `INDEX_LAG`), which is
  the stocks' and was left alone. Before the rival raced at 0.5 cents (it never traded at 3), home earned as much
  as a rack on fibre.
- Basis arbitrage, one seed: -319 a day at 0.5 cents (534 fills an hour) and no fill at 1 or more: two legs on two
  venues pay more in fees and spread than a basis the crowd keeps this tight. Roll from home, one seed: -439, the
  index's drift that morning, three fills an hour.

## The market's mechanics

- The futures desk's lead, 2026-11-08 (`test/futures.test.ts`, seed 6, ten minutes into the open): after every
  stock rose 1% within 10 ms, the Prairie Board's index future was half way repriced in 90 ms and HARBOR's index
  book in 736 ms. The crowds' lags (50 ms against 250, four times that for an index book) make it; nothing else.

- Latency below one tick (2ms) is one tick: a colocated firm and one a millisecond away are the same.
- The lab's batch auction batches the firms' orders and not the crowd's, so a waiting order meets a market
  that has moved; every firm loses under it, the fastest most. A real batch auction would hold the crowd too.
- The crowd acts on each book once in five ticks, staggered. Every book is swept on its turn: a sweep keyed
  to the exchange's clock once left four books in five never swept, and everything fed on them.

## Speed and frames

All headless with Playwright, borrowed from `~/projects/artshape-game-template`.

- The sim gets at most 8 ms of each frame (`BUDGET_MS` in the store); what does not fit is dropped, not owed,
  and the top bar says the speed reached when it falls short. Measured headless with the CPU throttled four
  times, about a mid-range phone: 1× and 10× hold 60 frames a second; 60× and 300× hold about 49, with the sim
  reaching 20×. Before the budget they ran at one frame a second with 800 ms stalls. A worker would lift the
  ceiling; the sim's one surface is the seam for it. On 2026-11-07, a fresh game in an open market, 12 s at each
  speed: the desktop's 300× reaches 70 to 75 at 60 frames a second, so a game day (23,400 s) takes about 300 s,
  not 78 (8 ms of 16.7 is under half the time, at about 52,000 ticks a second); throttled, 300× reaches 21 at
  54 frames, a day about 18 minutes. A game two days old holds about 50 frames at 10× throttled, on the
  Overview and the Market alike.
- `steps fast enough for the top speed` in `game.test.ts` starts timing a minute before the open, so a closed
  market flatters it: alone it reads about 77,000 ticks a second, but the open market alone is about 52,000,
  and under the whole suite it falls under its floor of 75,000 now and then, and always with other runs beside
  it (63,000 on 2026-11-08 beside four harness runs). Alone on 2026-11-07, after the Overview's sim changes:
  95,000 (four runs, 94,900 to 96,200).
- The night's tests, headless Chrome on 2026-11-07, one 12-core machine: a night is 3 pinned windows by 7
  setups, 21 runs of five simulated minutes. Close to `done` with the sim stopped: 48 to 52 s over eight
  nights, and the same with the sim running at 10× or 300×. CDP's CPU throttle refuses a worker, so the page
  throttled four times changed nothing; a phone-speed core is a guess from the stepping rate (a fourth), 190 to
  200 s. The main-thread fallback was not timed in a browser. Live sim beside a night, desktop: 60 frames a
  second at 10× and 59 at 300×, the speed reached as without (9.9; 76 to 81 against 70 to 75). Throttled, a
  game two days old, 10×: 51.5 frames a second with a night, 51.3 without; 300×: 47.4 and 48.7, reaching 14.7
  and 17.5, each window holding a pin or two. The worker has a core of its own; a phone with fewer may differ.
- A pin costs a stall the frame budget cannot cut: `structuredClone` of a save, which is 8 MB five minutes into
  the open and 9.5 MB by 14:30 (`game.save()` itself under 1 ms), takes 45 to 50 ms on the desktop and 165 to
  230 ms throttled four times (3 frames; 10 to 14). Timed as `publish()` at the pin: the first open of a game
  2 ms (empty quote logs), every later open, the headline and 14:30 pins 45 to 50 ms, throttled 183 and 185;
  the close, handing the pins to the worker, 42 to 64 ms (once 137), throttled 169. In real play at 300× the
  longest frames at pins were 33 to 50 ms against 17, once 117. Three pins and a close a day.
- The free-play save, 5 minutes into the open, is about 8 million characters of JSON (6.2 million the quote
  logs), past `localStorage`'s usual 5 million; packed it is 540,000 to 630,000. Measured headless on
  2026-11-08: the main thread pays 7 to 8 ms a save (JSON and the copy to the worker; 27 to 33 throttled four
  times), the worker 50 more; at 300× over 32 s the worst frames match the parent's (33 ms; throttled 83, at
  56.7 frames a second against 54.6). Packed on the main thread, gzip and base64 held a frame 50 ms, and 170 to
  200 ms throttled: Chrome's `CompressionStream` runs on the calling thread.
- Posting each pin to the night's worker as it is taken was weighed on 2026-11-08 and not done: `postMessage`
  clones on the main thread as `structuredClone` does, so it would save only the close's stall, one of four a
  day, and the day's pins would then live in the worker alone, so a worker that fails would lose the night the
  main-thread fallback now keeps.

## Layout shift

Measured headless with the browser's layout-shift score over fifteen seconds at 10×.

- 2026-11-05, a fresh game with everything shown: the phone 0.33 to 0.03; the desktop's market page about 0.6,
  nearly all of it the orders and gaps lists moving down a row as the newest arrives, which is their design.
  The other pages 0.
- The Overview, 2026-11-07, the same way: the phone 0 in every case; the desktop 0 to 0.02 (a fresh game 0 to
  0.015, two days and their nights 0.001), the charts block moving as the first points arrive.

## The stages

Measured by the stage harness (`test/stagepace.test.ts`). On 2026-11-05 over three seeds, seven trading days,
in trading time after the first open: a player who does each task at once opens stage 2 at 1.7 to 4.0 minutes,
stage 3 at 5.6 to 7.7 (after twenty arbitrage races), stage 4 when a noise headline and a real one have settled
(5.8, 167 and 252 minutes, the widest spread), and stage 5 at Monday of week 2, about three and a quarter real
hours at 10× or half an hour at 60×. A player who keeps momentum and buys fibre stays at stage 2. Under the
first rule, one lesson a stage, all five opened within eight minutes. A run of three seeds in parallel takes
about 27 minutes.

## The Overview

- The same seeds, 2026-11-08, after the night tests size and the fees signal's threshold (two days each): size up
  a step (200 to 300 shares) was better in at least one window on four of six nights (seed 1: 543 against 379
  in total, 982 against 609) and a little worse on the losing day; threshold up ran first on every night the
  fees signal fired; six rows read "about the same, though higher (or lower) in every one"; two nights of six
  still had every row about the same, and say so.
- `propshop.tests.v1` is about 9,000 characters a night (8,700 to 9,100 after one), so 180,000 at twenty, under
  4% of the usual 5,000,000-character limit.
- What a new player's nights say, by the night harness (`test/nightpace.test.ts`), 2026-11-08, three seeds,
  three days each, before the night tested size: 51 of the 52 variant rows were "about the same in every
  window". From home a five-minute window holds a trade or two of momentum and earns -$18 to +$720; a lookback
  a step either way, the city, fibre and a server each moved a window by $30 to $70, inside the $100 band
  (`SAME_CENTS`). The one mixed row was the city losing the headline's one big trade ($22 against $406). The
  first signal on every seed was "fees eat the edge" (fees 62% to 107% of gross), and its test did not run:
  variants stepped only a block's first parameter, and momentum's threshold is its second. Of the other
  signals, "one stock carries it" fired on two seeds; none of the rest did, as each needs a player who changes
  something (a second block, a rung bought) and this one did not.

## The experiments

The seeds were picked by searching (the day's headlines are scheduled when the game is built, so a seed's news
is read without running it). On 2026-11-06 the answers were: the headline, size better, threshold same, news
better; a few miles, city worse, fibre better, rack better; the free option, wider better, aside better, city
same. A run of two minutes takes 2 to 3.5 seconds in the browser.
