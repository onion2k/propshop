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
  the stocks' and was left alone, by Chris's choice (2026-11-08). Before the rival raced at 0.5 cents (it never traded at 3), home earned as much
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
- `steps fast enough for the top speed` in `game.test.ts` (now in `test/speed.test.ts`, `npm run floors`) starts timing a minute before the open, so a closed
  market flatters it: alone it reads about 77,000 ticks a second, but the open market alone is about 52,000,
  and under the whole suite it falls under its floor of 75,000 now and then, and always with other runs beside
  it (63,000 on 2026-11-08 beside four harness runs). Alone on 2026-11-07, after the Overview's sim changes:
  95,000 (four runs, 94,900 to 96,200).
- **With desks open,** the same setup as `steps fast enough for the top speed` (seed 12, `skipToOpen`, 10 s
  warm-up, 2 minutes timed) with `openDesk` first, alone, three runs on 2026-11-09 with the currencies desk built
  (5a): none open 83,500 to 86,300 ticks a second; the futures desk 64,000 to 66,100; the currencies desk 54,400
  to 55,300; both 45,600 to 46,200. The gate opens no desk, so a player at stage 3 or in free play has run under
  its floor since the futures desk opened. Profiled with both open (esbuild bundle, `node --cpu-prof`): the firms'
  deciding is 43% of a tick (building each rival's view of every watched symbol on every venue 14%, the blocks
  the rest), the exchanges' step 18% (the crowd 14%), the quote logs 12%, the stocks' drift 7%, the collector 7%.
  A skip to the open from Monday 16:10 takes 32 to 39 ms with the currencies closed and 114 to 115 with them open.
- **With desks open, after the step-rate cuts** (`plans/desk-speed.md`, 2026-11-09). The bundle method: an esbuild
  bundle of `Game` (`npx esbuild <entry> --bundle --platform=node --format=esm --loader:.webp=empty`), seed 12,
  `skipToOpen`, 10 s warm-up, 4 minutes (120,000 ticks) timed, `node x.mjs futures,fx`, three runs each, nothing
  else of mine running (the machine's own load about 1.6). Ticks a second, before then after, the two taken in
  the same half hour: none open 69,500 then 78,100 to 79,300 (+13%); the futures desk 51,400 to 52,400 then 62,100
  to 62,500 (+20%); the currencies desk 46,900 to 47,500 then 58,400 to 59,000 (+24%); both 37,600 to 38,000 then
  49,500 to 50,500 (+32%). (The morning's figures under a load of 1.3, before: 74,400, 56,800, 51,300, 40,900.)
  A game day at top speed with every desk open: scaled from the 52,000 ticks a second above (open market, none
  open, about 72× and a day in about 300 s) by the ratio of the rates, it was about 590 s and is about 450 s; with
  none open about 285 s. Profiled with both open after: the firms' deciding 40% of a tick (building a view 12%, the
  blocks the rest), the exchanges' step 37% (the crowd 18%), the quote logs 11%, the stocks' drift 9%, the
  collector 7%. What is left of the firms' share is the blocks' own reading (the depth and the tape 4% each) and
  the crowd's draws, which cannot move without moving the game. The step-rate floor and the gate were not
  touched. The cuts: the views' shared parts built once; a firm's plan, latencies, holdings and open orders kept
  until they change; quotes asked only of the venues that list a symbol; `narrowed` by prototype; and the quote
  log trimmed with `shift`, not `splice`. A cut tried and dropped: handing a venue the same quotes, tape and depth
  record again when none of its books had moved (hit 65% of the time, no measurable gain).
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

The lead, 2026-11-08 (seed 566, `npx vitest run test/experiments.test.ts`): from a rack at the Prairie Board on
fibre, 4 races won and 14 lost, $148; microwave better (13 and 1, $387); home the same (5 and 6, $152); a rack at
Lakeside on microwave the same (6 and 5, $146). Over ten seeds with a market-moving headline early on Monday,
microwave cut the races lost to Prairie Partners from 12 to 46 down to 0 to 4 on every one, and its P&L was
higher on three of ten: two minutes of lead-lag is a few hundred dollars, inside the noise.

## The currencies desk (5d), 2026-11-09

- **The triangle's gap**, before the pairs jumped (a scratch measurement over 20 minutes from the open, seeds 1
  and 2, every 50 ms): the cross on either venue was richer or cheaper than its legs, across all three spreads,
  in 0.01% to 0.03% of samples, at most 0.7 pips on the book. A smooth wander of about eleven pips an hour moves a
  tenth of a pip in the time the cross's crowd takes to follow, so the triangle never paid: in PACE (one seed,
  20 minutes) the book earned $3 a day from home and from the rack alike, the same 57 orders, and the dealer −98
  to 0. With each pair jumping now and
  then (`jumpsPerSecond` 0.01, 2.5 pips for EUR/USD and 3.5 for USD/JPY, `src/content/fx.ts`; reverting to the
  anchor as a stock's jumps do, and drawn from `world:fx` alone), the gap passes a pip in about 0.03% of samples,
  at most about 3.7 pips.
- **PACE**, `PACE=1 PACE_ONLY=fx npx vitest run test/pace.test.ts`, three seeds, an hour from the open, scaled to
  a stocks day (×6.5), at the defaults (triangle 1 pip and 10 lots, Kestrel 1 pip and 20 lots, carry 10 lots and
  a 50-pip stop). Dollars a day, the equity's move:
  - triangle on the book: from home (consumer) −16 (−29, −34, 15); from home on fibre 0 (3, −30, 28); from the
    rack in Eastholm 1,069 (631, 1,072, 1,503). Kestrel, beside it, 2,090 to 2,292.
  - triangle with the dealer: from home −11 (−7, −22, −4), refused 0 of 94, 97 and 100 orders; on fibre 22,
    refused 0 of 115, 97, 97; from the rack 466 (166, 562, 670), refused 18 of 156, 33 of 228, 40 of 248 (14%).
  - carry from home 56 (−41, 154, 54), a fill an hour.
  - the triangle's threshold from the rack, on the book: 0.5 pips 1,230 (680 fills an hour), 1 pip 1,069 (431),
    2 pips 728 (209). The defaults were left as they were.
- **The plan's check is met:** the triangle earns from a rack at the centre and not from home, and on the dealer a
  fast firm is refused more often than a slow one, on each of three seeds. Most of what the dealer turns down is
  not refused outright: the order is held 5 ms, the crowd reprices the book in that time, and the order meets
  nothing (counted as missed).
- **Last look**, seed 30 (`npx vitest run test/experiments.test.ts`): the dollar jumps 8.7 pips against the yen
  41 seconds into a window from 9:31:00. Found by stepping seeds 1 to 30 with the desk open and reading the largest
  move of EUR/USD's or USD/JPY's fair value in a tenth of a second in the first quarter hour from 9:31 (9.2 pips
  the largest, on seed 3, at 9:42; seed 30's came first). The triangle at 100 lots with the dealer from the rack:
  29 legs, 2 filled in full, 1 refused and 26 more gone after the look, $79; on the book 90 legs all filled, $299
  (better); the dealer from home 4 legs, none refused, $0 (same); the book from home 10 legs, 4 lost to Kestrel,
  −$24 (worse).
- **The futures desk with the stocks' blocks kept to the stocks** (fix 1): the busy colocated game of
  `test/instruments.test.ts` with the futures desk open, IXF watched and mean reversion added, ten minutes from
  the open: the market maker quoted IXF 4 times before and not after; the game then went its own way (1,671
  fills and equity $188,300 before, 1,719 and $200,064 after).
- **Unchanged by 5d:** every PACE row from before the desk (the stocks' and the futures desk's, 46 rows, three
  seeds; after, with `PACE_ONLY` set to the names of those rows, before on a copy of the tree from before 5d), and
  the stage harness (`STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1`), each
  stage opening at the same moment. The whole PACE harness takes about 73 minutes on this machine under load,
  past the test's hour: it prints its table and then reports the timeout.

## The miner (6a), 2026-11-09

Ridgeline Mining (`RDG`, $45, sector mining, not in the index) joined the stocks, which changed what `world` draws
for every seed, on purpose (`plans/desk-metals.md`, 6a). Before is a copy of the tree at `d653b38`; after is the
working tree with the miner. Both by `PACE=1 PACE_SEEDS=<n> PACE_ONLY=home,city,colo,prairie,lakeside,fx npx
vitest run test/pace.test.ts`, one process a seed, the timeout raised in the copy (each took about 26 minutes,
seven at once), and `STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1 npx vitest run test/stagepace.test.ts`.

- **PACE**, an hour from the open of seeds 1 to 3, scaled to a day, dollars a day, before → after (seeds after):
  - home: arbitrage 366 → 471; the maker 857 → 1,064; momentum 339 → 85 (528, −464, 190); revert −3,562 → −3,579;
    sniper 423 → 332; news and index arbitrage no fill, as before; the hand −28,780 → −33,198.
  - city: momentum 599 → 62 (1,644, −916, −542); arbitrage −5,190 → −403; held near −4,708 → 199; the maker
    2,739 → 3,547; arbitrage with the maker −2,021 → 3,721.
  - colocated: arbitrage 5,167 → 5,990; the maker 5,403 → 6,929, and 37,140 → 40,288 at no half-spread; revert
    −7,059 → −6,609; sniper 3,653 → 1,157; pairs −941 → −66; index arbitrage −212 → −322; the hand −8,865 →
    −28,363 (before, seed 2 made 38,570; after, all three lose 26,000 to 31,000).
  - the rivals beside home arbitrage: Harbor Quant 5,626 → 13,881, Lakeside Partners −10,396 → 776, Midtown
    −12,196 → 153, Bayview 987 → 1,285 (before, seed 2's morning cost each of the first three 11,000 to 37,000).
  - the futures desk: lead-lag from home 1,050 → 1,045; a rack at the Prairie Board on fibre 1,022 → 1,030, on
    microwave 1,523 → 1,787 (at 1 cent 1,507 → 1,122); a rack at Lakeside on microwave 1,472 → 1,662; Prairie
    Partners 1,001 → 1,085; basis arbitrage 5 → 0, at 0.5 cents −322 → −349; the roll −12 → −47.
  - the currencies desk: every row the same to the dollar, and each refusal count the same.
- **The stages**, seed 1, one day, the follower: stage 2 at 1.4 → 1.2 minutes of trading, stage 3 at 3.4 → 1.5,
  stage 4 at 3.4 → 1.6; stage 5 not by the end of the day either time. The sitter: stage 2 at 1.4 → 1.2. Both
  before and after are below the 2026-11-05 figures above (three seeds, seven days: stage 3 at 5.6 to 7.7), and
  the miner moves stages 3 and 4 earlier still: the twenty races come sooner. Not re-tuned.
- **The step rate**, `npx vitest run test/game.test.ts -t "steps fast enough"` alone (the floors have since moved to
  `test/speed.test.ts`, run alone by `npm run floors`; these figures are as measured then), three runs each: before
  87,000 to 92,000 ticks a second and 52,500 with both desks open; after 86,500 to 86,700 and 49,700 to 50,200.
  Inside `npm run check` (the other files beside it): before 90,400 to 91,100 in three runs; after 74,100 to
  82,800 in four, under the 75,000 floor in two of them (the desks-open figure 41,300 to 44,400, over its 40,000).
- **The experiments' seeds**, found again by each one's method (the schedule is drawn when the game is built, so
  a seed's headlines are read without running it), seeds 1 to 1,000; the method finds the old seeds on the old
  tree. `npx vitest run test/experiments.test.ts`, two-minute windows:
  - the headline, 854 → 70 (Quantal recalls a product line 40.2 s in): momentum $281; size better ($592), threshold
    the same ($268), news worse ($95; it was better).
  - a few miles, 854 → 70: arbitrage from home −$708, 224 won and 109 lost; the city worse (−$1,084), fibre better
    (−$205), the rack better ($182).
  - the free option, 879 → 537 (Quantal beats on earnings 93.4 s in): −$875; wider better (−$417), aside better
    ($583), the city the same (−$869).
  - the lead, 566 from 9:31:06 → 338 from 9:31:05 (the print 40.1 s in): $561, 7 won and 24 lost; microwave worse
    ($414, 19 won and 9 lost; it was better, 13 and 1), home the same ($483), Lakeside the same ($659).
  - last look, 30 kept: `world:fx` is untouched, and the dollar still jumps 8.7 pips 41.3 s in, with the same legs,
    refusals and fills. Each run reads about $70 more ($149, the book $369, home $71, the book from home $47):
    the firm comes into the window holding 200 VRT from the warm-up's momentum, as it did before, and that stock
    now moves.
- **A save from before the miner** (seed 3, five minutes into Monday, from the copy) loads as a good game:
  `RDG` comes in at $45 with empty books that the crowd fills at once (quoted on all three exchanges two minutes
  on, and a hand buy of 100 filled), the Mining factor at nought, its history from the load, and no trending-day
  drift until the next open. Its `world` stream carries on from where it was saved but now draws for the miner
  too, so it is not the future it had; a save of the loaded game reloads to the same future.

## The metals desk in the sim (6b), 2026-11-09

The metals desk's venues, spot gold and silver, the `GC` and `SI` futures, leases, storage and supply news are in
the content, closed (`plans/desk-metals.md`, 6b). Before is a copy of the tree with 6a, uncommitted, in the
scratchpad; after is the working tree.

- **The step rate**, `npm run floors` alone (nothing else running), three runs each. Before: 88,900 to 89,700 ticks
  a second, and 50,900 to 51,100 with futures and fx open. After: 85,200 to 86,300 with every desk shut, and
  39,500 to 39,700 with futures, fx and metals open: under the 40,000 tripwire in all three runs. The esbuild bundle
  (seed 12, four minutes from the open, `node --cpu-prof`): metals alone 57,000, futures and fx 47,700 to 48,700,
  all three 39,800 to 40,200; every desk shut 74,100 to 75,200 before and 71,600 to 73,000 after. The profile with
  all three open spreads the cost over the books (the crowd's step, the quote log, the depth and tape the firms
  read) and the draws: twelve more books (two spots on three venues, six contracts on Hudson), not one hot path.
  _Amended in 6c:_ Hudson no longer lists the spot, so ten more books (two spots on two venues, six contracts).
  The leases and the reads are `driftDesk`'s 2.2% (1.1% without metals). With the desk shut the cost is about 3%
  in the floor test, its cause not pinned in the profile.
- **Fingerprints** (`test/instruments.test.ts`): every figure of the busy game and of the two-desk game the same;
  the fingerprints with the metals desk there and closed `ab8d1400` (busy), `d7fa5a46` and `cecb8650` (two desks,
  seeds 1 and 2); without it `d8661a66`, `5a409e9e` and `473e9068`, the post-6a ones, to the bit. With metals open
  too: `beafb15` and `5c3e6bd3`, the player's fills, orders and orders by block the same.
- **PACE**, `PACE=1 PACE_SEEDS=1 PACE_ONLY="home arb,home momentum,colo mm,prairie leadLag mw,fx home triangle book"
npx vitest run test/pace.test.ts`, before and after, every row (15, the rivals beside them included) the same to
  the dollar: home arbitrage 653, momentum 528, the colocated maker 8,044 (18,348 at no half-spread), lead-lag on a
  Prairie rack on microwave 2,211, the triangle from home −29. **The stages**, `STAGE_PACE=1 STAGE_SEEDS=1
STAGE_DAYS=1 npx vitest run test/stagepace.test.ts`: every line the same (the follower's stages 2 to 4 at 1.2,
  1.5 and 1.6 minutes, the sitter's stage 2 at 1.2).

## The fix (6c), 2026-11-09

Thamesford's two fixes, a call auction at 05:30 and 10:00 with a 30 s call (`plans/desk-metals.md`, 6c), and before
them the amendment to 6b: Hudson lists the futures only, the spot trading on Sundar and Thamesford. "Step 0" is a
copy of the tree before 6c with only the spots' `venues` changed; "6c" is the working tree. Node 24.

- **The step rate**, `npm run floors` alone (nothing else of mine running), three runs each, the two trees taken in
  turn. Step 0 (six runs): every desk shut 85,600 to 87,100 ticks a second, every
  desk open 40,385, 40,383, 40,044, 40,640, 40,160 and 39,977. 6c: 86,000 to 87,100, and 40,013, 40,032, 40,064. So Hudson's two spot books gone lift
  every desk open from 39,500 to 39,700 (6b) to about 40,000 to 40,600, and the fix costs nothing seen: the floors'
  two minutes from the open reach no call. A first cut of 6c's quote log (reading every book's last entry each tick)
  read 83,600 to 84,100 and 39,300 to 39,500; it now takes the old path on a venue without fixes.
- **The fix, measured** (seeds 1 to 3, the whole content, metals open, blocks off, the 10:00 call stepped tick by
  tick, a probe not kept): gold fixed at 24,015, 23,866 and 24,242 points (the Thamesford mid 30 s before the call
  24,030, 23,862.5, 24,241.5), volumes 2,000, 1,000 and 900; silver 2,983, 2,963 and 3,060 (mid 2,987, 2,962.5,
  3,060.5), volumes 800, 800 and 1,300. The books held 36 to 48 orders as the call began, 40 to 47 at its end, 31 to
  38 after the fix; the fix's tick took 0.1 to 0.4 ms. Stepped a minute at a time (a skip over closed hours), the
  call is stepped over and the fix comes with the crowd's book uncrossed: "no fix".
- **Fingerprints** (`test/instruments.test.ts`), the amendment: with the metals desk there and closed, `ab8d1400` →
  `702a3c4f` (busy), `d7fa5a46` → `9326e341` and `cecb8650` → `4f30cd6d` (two desks); metals open `beafb15` →
  `adab4574`, `5c3e6bd3` → `1f0cdc79`; every fill, order and figure the same, and the held ones (`d8661a66`,
  `a45526ec`, `5a409e9e`, `473e9068`) unmoved. 6c moved none of them, the metals-open ones included (ten minutes
  from the open reach no fix).
- **PACE**, `PACE=1 PACE_SEEDS=1 PACE_ONLY="home arb,home momentum,colo mm,prairie leadLag mw,fx home triangle book"
npx vitest run test/pace.test.ts`, before (a copy of the tree before the amendment) and after 6c: all 15 rows the
  same to the dollar (home arbitrage 653, momentum 528, the colocated maker 8,044 and 18,348 at no half-spread,
  lead-lag on a Prairie rack 2,211, the triangle from home −29). **The stages**, `STAGE_PACE=1 STAGE_SEEDS=1
STAGE_DAYS=1 npx vitest run test/stagepace.test.ts`: every line the same (the follower's stages 2 to 4 at 1.2, 1.5
  and 1.6 minutes, the sitter's stage 2 at 1.2).

## The metals blocks and the rival (6d), 2026-11-09

`curve`, `fixArb`, `crossPairs`, Aldgate Metals on the Thamesford rack and the mark that reads the open spot venue
(`plans/desk-metals.md`, 6d). "Before" is a copy of the tree before 6d. Node 24.

- **The step rate**, `npm run floors` alone, three runs each: before 89,955, 90,266, 91,449 ticks a second shut and
  42,027, 41,993, 41,702 every desk open; after 84,685, 85,907, 84,346 and 38,489, 38,589, 38,519. The two trees run in
  turn, three rounds (`npm run floors` in each, nothing else running): before 85,944, 84,283, 85,648 and 39,821,
  39,733, 39,795; after 84,444, 86,417, 86,631 and 38,701, 38,787, 38,581; after without the rival 85,799, 85,491,
  85,694 and 40,176, 39,970, 40,306. So shut is unmoved, and the rival costs about 2.8% with every desk open.
- **The rival's profile** (seed 12, every desk open, two minutes from the open, the rival's calls timed, a probe not
  kept): before the early return, 91 ms of 1,606 in the rival's step, of it 54 ms in `fixArb`'s decide and 26 ms
  building its view; that first cut read 37,764 to 38,159 every desk open, interleaved (−5.4%).
- **The fix against the future** (seeds 1 to 5, Monday's 10:00 call, every 5 s): the indicative was within 0 to 3
  points of the spot the front gold future implies (about 1 bp), and the fix within 1 point of the last indicative.
  Aldgate at 1 bp, seeds 1 to 6, Monday 10:00, Tuesday 05:30 and 10:00: 7 to 42 orders rested, cumulatively, and one
  fill (seed 3, silver, Tuesday's 10:00 fix: sold 4 at 2,950, hedged long in the front future, both out at 2,949).
- **Held to the bit**: the held fingerprints and the whole-content closed ones; PACE, `PACE=1 PACE_SEEDS=1
PACE_ONLY="home arb,home momentum,colo mm,prairie leadLag mw,fx home triangle book" npx vitest run test/pace.test.ts`
  (15 rows, home arbitrage 653, momentum 528, the colocated maker 8,044, lead-lag 2,211, the triangle −29) and
  `PACE_ONLY="colo pairs"` (−56); `STAGE_PACE=1 STAGE_SEEDS=1 STAGE_DAYS=1 npx vitest run test/stagepace.test.ts`
  (stages 2 to 4 at 1.2, 1.5 and 1.6 minutes). The pairs game in `test/metalblocks.test.ts`, `caf87952`, before and
  after. Metals open moved with the blocks and the rival: `adab4574` → `b0c0774`, `1f0cdc79` → `b4c4cf9f`.

## The metals desk's lessons, experiments and tuning (6f), 2026-11-09

`plans/desk-metals.md` 6f. "Before" is a copy of the tree before 6f. Node 24. Every figure here is one machine's.

- **The tuning harness**, `METAL_PACE=1 METAL_SEEDS=1,2,3 npx vitest run test/metalpace.test.ts` (JSON to
  `METAL_OUT`, about ten minutes), with the clients' flow at the fix (`FIX_FLOW` in `src/content/metals.ts`: 70% of
  calls, 10 to 200 lots, the share of the range a uniform draw squared, in the last 150 ms, six grid steps through the
  belief), the crowd in lots of one, and `fixArb` at 4 bp:

  | Check, over seeds 1, 2, 3                                            | Seed 1                  | Seed 2                 | Seed 3                 | Met             |
  | -------------------------------------------------------------------- | ----------------------- | ---------------------- | ---------------------- | --------------- |
  | The curve flips to backwardation in a game week (gold; silver)       | 4; 6 flips              | 1 (12 min); 0          | 2; 0                   | yes, every seed |
  | Storage, the week's 60 lots of gold held into delivery; rolled       | −$60.19; $0             | −$60.12; $0            | −$61.59; $0            | yes             |
  | `fixArb`, nine fixes (Mon 10:00 to Fri 10:00): home; Thamesford rack | $0 (0 fills); $150 (24) | $0 (0); $60 (16)       | $0 (0); $140 (20)      | yes             |
  | … the Hudson rack; Aldgate, 4 lots, beside the Thamesford row        | $75; $284               | $10; $120              | $100; $234             | (not a check)   |
  | 25 lots of gold, the fix against the slices, over the mid where told | 35¢ vs 9¢               | 5¢ vs 5¢               | 35¢ vs 9¢              | **no**          |
  | … in average price                                                   | $2,404.20 vs $2,404.28  | $2,391.70 vs $2,389.56 | $2,415.70 vs $2,415.67 | **no** (1 of 3) |

  The curve flips readily: gold was in backwardation for 1,667 and 3,566 minutes of the week on seeds 1 and 3 (the
  lease past 9% at its height, a carry of −9.2%), 12 minutes on seed 2. The fix's distance from fair (bps, the flow
  in lots): gold's moves 0 to 3 bp whatever the flow (a point is 0.4 bp and the crowd's depth runs six points), silver's
  10 to 20 bp under a flow of 100 lots or more (a cent is 3.3 bp). From home on a laptop (72 ms each way) `fixArb` never
  rests in time for the flow; from Hudson (29 ms) it sometimes does. At 1 bp, home earned $15, −$10 and $0 over five
  fixes, resting on noise a tick wide and paid when the flow came its way, and the Thamesford rack $2, $0 and $0, held
  back by a sell it had rested when the fix was rich (fixed: a resting order is pulled once the indicative has left its
  side). At 4 bp home never rests.

- **Why the fix does not beat the minute for a large order.** The slices pay about half a tick over the mid (5 to 9¢
  an ounce): gold's book is a point wide and refills within milliseconds, and the crowd's belief does not move for a
  buyer, so a minute of two-lot IOCs leaves no mark. The fix pays its one price, which the buyer's own 25 lots and any
  clients' buying push up the ask side of the call's book, about 3.5 points on seeds 1 and 3. A deeper call book would
  only bring the fix to the ask (the uncrossing lands on the grid, and a buy imbalance lands it on the ask side); only
  impact that lasts in continuous trading, or a book that thins before the fix, would make the minute dearer. Not
  added: for Chris.
- **The fix experiment's seed**, 2013: of seeds 1 to 3,000, read from the metals news drawn on `world:metals` as the
  desk opens (one minute stepped, as `startOf`'s skip does), those with a headline on gold from two minutes before the
  10:00 fix to thirty seconds after it: 383, 462, 1090, 2013, 2065, 2339, 2356, 2781, 2931 (gold), others on silver.
  2013's lands at 09:59:30.6, the call's first second (central banks, +109 points over two minutes); 2931's at 09:59:43
  (a deposit, −190). 2013 was taken so the fix's money and its price against the mid part ways. `npx vitest run
test/experiments.test.ts`: the slices $2,403.83 an ounce, 6¢ over the mid, $2,030; into the fix $2,406.50, 10¢ under
  the mid, $1,375 (worse: gold rose into 10:00); all at once $2,405.44, $1,614 (worse); slices from the rack $2,030
  (same). Its start takes about 1.5 s (minute steps to 09:56, ticks from there), each run 2.5 s.
- **The delivery experiment**, seed 1, Friday 13:27:30 for four minutes from a Hudson rack, 60 lots of `GC0`: held
  through, $1,447,588 of gold delivered, cash −$1,247,253, $20 of storage a night and $59 that Friday, the window's
  P&L $307; rolled −$30 (worse, two spreads on 120 lots), closed $131 (worse), from home $302 (same). Its start takes
  about 2.3 s (four days a minute at a time), each run 3.2 s. At 20 lots every change came out "about the same".
- **PACE**, `PACE=1 PACE_SEEDS=1,2,3 PACE_ONLY=metals npx vitest run test/pace.test.ts` (the hour from the stocks'
  open, which holds the 10:00 fix; scaled to a day as every row is, so the fix rows count 6.5 fixes a day): $/day,
  seeds 1, 2, 3: curve home 0 (no fills), Thamesford −332, −33, 0, Hudson −501, −98, 0; fixArb home 0 (no fills),
  Thamesford 195, 0, 0, Hudson 194, 0, 0, Aldgate beside them 324 to 389 on seed 1 and 0 on 2 and 3; crossPairs (the
  miner and gold) home −855, −118, −167, Thamesford −722, −172, −200, Hudson −1,021, −210, −65. The hour holds one fix,
  so the fix rows are read from the tuning harness's nine; `curve` and `crossPairs` lose from every seat in the hour
  (not tuned in 6f).
- **Momentum over nine seeds** (`PACE=1 PACE_SEEDS=1,2,3,4,5,6,7,8,9 PACE_ONLY="home momentum,city momentum"`),
  before the miner (commit `d653b38`) and now, $/day: home 93, 496, 429, 276, 9,491, −186, 232, 1,748, 5,949 (mean
  2,059, median 276) → 528, −464, 190, −78, 11,609, 167, 263, 2,584, 2,711 (mean 1,946, median 263); city 159, 1,955,
  −316, 285, 15,070, −357, 171, 1,910, 8,300 (mean 3,020, median 285) → 1,644, −916, −542, −215, 18,022, −404, 340,
  2,616, 4,051 (mean 2,733, median 340). The drop on seeds 1 to 3 (339 → 85, 599 → 62) does not hold over nine: one
  seed's day in nine carries the mean either way.
- **The step rate**, `npm run floors` alone, three runs each, turn about with the copy before 6f: after 83,940,
  84,750, 84,486 shut and 38,837, 38,823, 39,014 every desk open; before 84,361, 83,306, 84,977 and 38,290, 38,022,
  38,563. Under the 40,000 tripwire either way (allowed until Chris re-sets it after 6f); inside `npm run check` it
  read 80,764 and 37,042.
- **The tripwire re-set**, 2026-11-09: Chris set the every-desk-open floor to 35,000 from these figures. A game
  day at top speed with every desk open is about 580 s (450 s at 50,000, scaled to 38,900).

## The weekly rent (Part E of `plans/play-and-learn.md`), 2026-11-09

The rents are drafts, held by nothing. "Before" is a copy of `HEAD` (`bc2b3b8`, before the rent) in a scratch directory;
"after" is the working tree. Node 24. Every figure here is one machine's.

- **What a seat earns, from the PACE harness before the rent**, `PACE=1 PACE_SEEDS=1,2,3 PACE_MINUTES=20 PACE_ONLY="home
momentum,city momentum,city arb+mm,colo mm,colo arb,home arb,prairie leadLag mw,fx eastholm triangle book,metals
thamesford fixArb,metals hudson fixArb,colo pairs,home mm" npx vitest run test/pace.test.ts` (twenty minutes from
  the open of three seeds, scaled to a day, so a week is five times the figure; it understates momentum, and its hour has
  no fix, so the metals rows read nought), dollars a day, mean (seeds 1, 2, 3): home momentum −812 (−1,055, −716, −666);
  city momentum −1,154; city arbitrage with the maker 4,411 (1,427, 4,942, 6,864); colocated maker 7,329 (6,805,
  7,410, 7,771); colocated arbitrage 6,191 (11,021, 4,763, 2,789); Prairie rack lead-lag on microwave 1,657 (2,097,
  1,405, 1,469); the triangle from Eastholm on the book 1,725 (842, 956, 3,378); Harbor Quant 14,465. Added for the
  seats the harness has no row for (a scratch test, same method, arbitrage): lakeside rack on fibre and a server 855
  (1,809, 275, 480); Pacific rack on fibre and a server 1,405 (3,116, 349, 750); racks at HARBOR and LAKESIDE on
  microwave and a rack 3,423 (7,083, 1,620, 1,565); racks at all three on laser and an FPGA 13,235 (30,455, 4,093,
  5,156), and 15,838 with the maker (26,132, 10,314, 11,067); the city rung on arbitrage alone −680.
- **The rents** (cents a week in the content; the first draft was 2% of the price for all), against the setup the
  harness measured, a week being five days of the median seed (the mean is dominated by seed 1):

  | Seat (office, line, computer)                | Price      | Rent a week | Earns a week (median seed; mean) |
  | -------------------------------------------- | ---------- | ----------- | -------------------------------- |
  | Home, consumer, laptop                       | $0         | $0          | whole days: about $28,500 mean   |
  | City, fibre, server                          | $18,000    | $360        | arb + maker $24,710; $22,055     |
  | Lakeside rack, fibre, server                 | $90,000    | $1,800      | $2,400; $4,275                   |
  | Pacific rack, fibre, server                  | $90,000    | $1,800      | $3,750; $7,025                   |
  | Harbor rack, microwave, rack                 | $260,000   | $5,200      | maker $37,050; arb $23,815       |
  | Harbor and Lakeside racks, microwave, rack   | $430,000   | $6,600      | $8,100; $17,115                  |
  | All three, laser, FPGA                       | $1,400,000 | $18,000     | arb $25,780; $66,175             |
  | Prairie rack, microwave, rack (futures)      | $260,000   | $5,200      | lead-lag $7,025 worst seed       |
  | Eastholm rack, fibre, rack (currencies)      | $145,000   | $2,900      | triangle $4,210 worst seed       |
  | Thamesford or Hudson rack (metals), the rack | $80,000    | $50 (rack)  | fixArb $60 to $150 (nine fixes)  |

  Each line: office, line and computer rents are in `src/content/upgrades.ts` and the desks' files (city $160, fibre
  $100, server $100; each Harbor, Lakeside, Pacific or desk rack $1,600; Harbor and Lakeside racks $3,000; all three
  $8,000; microwave $2,400; laser $5,000; the rack computer $1,200; the FPGA $5,000; the metals racks $50). The
  first draft at 2% put the Harbor-and-Lakeside seat at $8,600 and the all-three seat at $28,000 a week, which the
  median seed did not cover ($8,100 and $25,780), so the dearest were lowered to $3,000, $8,000, $5,000 and $5,000
  (1.2% to 1.4% of their prices). The economy was not touched.

- **The metals desk cannot cover 2%.** The 6f tuning harness (nine fixes, Monday 10:00 to Friday 10:00; see the
  section above) puts `fixArb` from the Thamesford rack at $150, $60 and $140 a week and from Hudson at $75, $10 and
  $100, with the curve and the cross pairs losing from every seat. A $1,600 rack rent would make the metals target
  unreachable, so the two racks pay $50 (0.06%), which the desk's own net beats on every seed from Thamesford; the
  rack computer and the line it needs ($1,300 together) are not covered by any metals setup measured. Not tuned
  further: a metals seat that earns its whole setup needs a bigger `fixArb` than the harness runs, for Chris.
- **Unchanged by the rent:** the same PACE rows after, to the dollar (`diff` of the `$/day` lines; the hour holds no
  Friday close); one day of the night harness, `NIGHT_PACE=1 NIGHT_SEEDS=1 NIGHT_DAYS=1 npx vitest run
test/nightpace.test.ts` (seed 1, Monday, the starting setup), the JSON identical before and after (day P&L $13.52,
  fees $22.97, seven variants' windows and verdicts); the seven experiments' runs (`test/experiments.test.ts` now pins
  them: all 28 runs' P&L, fills and fees are those from before); the pinned fingerprints in `test/instruments.test.ts`
  did not move. The night harness takes about 4.4 minutes a day here; a Friday was not run.
- **A load at the close.** A game saved the tick before a close and loaded does not empty the crowd's books at that
  close (so on a Monday as on a Friday: found while writing the save test, not looked into), so the save test compares
  the firms and the days, which are all the rent touches.

## The options desk, closed and open (plans/desk-options.md 7b, 2026-11-10)

- **The index's day,** fair values alone, seeds 1 to 4, 15 days (44 sessions, 40 close-to-close): the session's rms
  move 82.7c, the overnight's 37.1c, close to close 91.9c (an earlier 36-day pass: 85c). Per-minute log variance
  5.45e-7 in the stocks' hours (23% a year on a trading year of 252 sessions of 6.5 h). Variance ratio against the
  one-minute figure: 5 min 1.12, 15 min 1.08, 30 min 0.97, 60 min 1.04, a session 1.27 (trending days drift). So the
  stocks' wander does not revert the way the first pass thought: sampling each second is sound; the overstatement was
  calendar time, now trading time with shut hours at 0.07 (overnight variance per hour over a session hour).
- **The straddle against the day,** `Market` fair values only, no crowd, options and futures open, seeds 1 to 5, ten
  weekdays each (50 days): the call and put of the listed strike nearest the index at 09:30, today's expiry, priced
  at the open against their intrinsic at 16:00. Command: an esbuild bundle of a script stepping 2 s (not kept).
  Before (calendar time, 1e-4 event variance, 53% start): price 89.4c, intrinsic 68.6c, price/intrinsic 1.30,
  price/|move| 1.72; the seller won 37 of 50 (mean +20.8c a contract, sd 48.1); by regime: calm +37.7 (11/14),
  choppy +27.7 (12/14), trending +24.4 (9/11), news -13.1 (5/11). After (trading time, diffusion share 0.75,
  event variance 2.5e-5): price 67.7c, price/intrinsic 0.99, price/|move| 1.30, seller won 29 of 50 (mean -0.9, sd
  50.5); calm +21.9 (10/14), choppy +6.4 (10/14), trending +3.6 (5/11), news -43.5 (4/11). By seed after, the
  ratio ran 0.80 to 1.61. With the share set to 0.83 (the days hold 2.2 releases after 09:30 on average, 5.5e-5 of
  a session's 2.4e-4, against the premium's 32% on variance), the final content: price 69.5c, intrinsic 68.6c,
  price/intrinsic 1.01, price/|move| 1.34, seller won 29 of 50 (mean +0.9, sd 50.8); by seed 0.82 to 1.66; calm
  +24.0 (10/14), choppy +8.2 (10/14), trending +5.2 (5/11), news -42.4 (4/11).
  The seller earns on calm and choppy days, barely on trending, and loses on news days, as the plan wants; 50 days
  is thin (the ratio's spread by seed is wider than the premium).
- **The step rate,** `npm run floors` alone, with the options desk open: 33,014 / 33,055 / 32,930 first built (13%
  under futures, fx and metals' 38,085); after pricing only when the index moves 0.2c or 100 ms pass, and only in
  the stocks' hours, and two exact cuts (`settleIndexes` over the indexes alone, `venuesOf` kept until the live set
  changes): 35,438 / 35,473 / 35,464; none open 87,521 / 87,811 / 87,680. The profile (esbuild bundle, seed 12,
  `node --cpu-prof`, all four open): the pricing was 1.9% self (settleDerived) with `optionFair` and the normal
  distribution under it, now nearly nothing; what remains is the twelve more books on the ordinary crowd: the sweep
  `cancelWhere` +113 ms of a 6.9 s window, the exchange step +36, `walk`/`quote`/`aggregate` +65, the normal draws.
  With the options venue's crowd switched off (a throwaway test) the rate was 38,000 to 38,100, so the quoter of 7c
  can save at most about 7% (2,600 ticks a second).
