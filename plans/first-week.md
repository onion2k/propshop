# The guided first week

State: landed on main at f2dabff, 2026-11-02.

## Context

The game has the mechanics and the race replay, but a new player opens it to a wall of panels and no idea
what to try first. A short set of lessons turns the mechanics into a path: each says what to do and what to
watch, is ticked off by the game itself when the thing has happened, and then says what it meant. It is a
checklist, not a tutorial that takes over: everything stays available.

## What is built

- **Lessons are content.** `src/content/lessons.ts` lists them in order: id, title, what to do, what to
  watch for, a `done(snapshot)` check on the plain snapshot, and the lesson in a sentence or two, shown once
  it is done. Eight for the first week: see two exchanges disagree; lose a race; count what being slow
  costs; find what earns from home; get picked off as a market maker; tell news from noise; buy a better
  seat; reach the second week.
- **Progress is the store's.** The store runs the checks on each publish, keeps the set of done ids with
  the simulated time each was done, and saves it beside the game under its own key. A reset clears it.
- **A First week tab,** first among the tabs and the one open at the start, lists the lessons: done ones
  ticked with their lesson revealed, the first open one marked as current, the rest dimmed. The tab shows
  how many are left.

## Parts

- [x] 1. Lessons content and their checks, with a test for each check on a built snapshot.
- [x] 2. The store's progress, saved and reset, with a test.
- [x] 3. The tab, with a UI test that sees a lesson ticked.

## Verification

`npm run check` green. In the browser, a new game opens on the First week tab, lesson one ticks within a
minute of the open at 60x, and lesson two ticks once an arbitrage leg is beaten.
