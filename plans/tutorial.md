# A tutorial mode

State: building, part 1 of 2.

## Context

The game has grown past what a new player can take in from a wall of panels: three pages, a watchlist, eight
blocks, a shop, risk limits, reports. The first week's lessons tick things off but do not take anyone by
the hand. A tutorial should: show one thing at a time, point at it, drive the clock where the step needs
it, and wait for the thing to happen before moving on. Everything stays available underneath; the tutorial
can be skipped or left at any step and picked up again.

## What is built

- **Steps are content** (`src/content/tutorial.ts`): a title, a short text, the page to show, the element
  to point at (by a `data-tut` name), what to do to the game on entry (pause, a speed, skip to the open,
  turn a block on), and either a check on the snapshot that must pass before Next is allowed, or nothing,
  in which case Next is free. Fourteen steps, from "this is your firm" to "the first week picks up here".
- **The state is the store's**: the current step, or done, saved under its own key beside the progress;
  Start again clears it. A fresh game with no lessons done and no tutorial state opens a welcome card:
  take the tutorial, or just play.
- **The card**: fixed at the bottom on a phone and at the bottom right on a desk, with the step count, the
  title, the text, Back, Next (disabled until the step's check passes, with a line saying what it waits
  for), and Skip. The page switches to the step's page, and the step's element gets a spotlight outline.
  The first week tab offers "Take the tutorial" again once it is skipped or done.

## Parts

- [x] 1. Steps, store state, and tests on the steps' checks and the store's save.
- [x] 2. The card, the spotlight, the welcome; a UI test that walks the first steps.

## Verification

`npm run check` green. In the browser at a phone's width and a desk's: the welcome shows on a new game,
the tutorial walks through every step with the right page and spotlight, and Skip returns to the game.
