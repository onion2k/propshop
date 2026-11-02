# The day report

State: landed on main at 48a2d04, 2026-11-02.

## Context

The game shows the day's P&L as one number in the top bar and keeps a bare record of each day. A player
who wants to know what happened today, which block earned and which bled, how many races were won, what
the news did, has to have been watching. At each close the game should say so itself, and over days those
reports become the progress chart.

## What is built

- **The firm reports what finished.** Each tick the firm lists the orders that reached a terminal status
  (`tickResolved`), beside the fills it already lists.
- **The game keeps a day's tallies** from the open: fills by block and by stock (count, realised, fees),
  races (immediate-or-cancel orders filled in full, beaten, or missed with nobody named), fees, fines, the
  rivals' equity at the open. At the close it writes a `DayReport`: day and weekday, P&L (equity at close
  less at the open), the tallies, the day's headlines with what each moved, the firm's latency, and each
  rival's name and day P&L. Sixty are kept and saved; `days` in the snapshot is these.
- **A Days tab** shows the latest report in full: a one-line verdict, P&L by block and by stock as small
  tables, races as won, beaten and missed with the share won, fees and fines, the headlines, and the rivals
  with yours among them. Earlier days are collapsed beneath, newest first. Above them a canvas draws daily
  P&L as bars, green and red, with equity as a line, over every day kept. The tab's badge says "new" from
  a close until the tab is opened.

## Parts

- [x] 1. The firm's resolved orders, the game's tallies and report, and tests on a stepped day.
- [x] 2. The Days tab, the bars, and a UI test that sees a report after a close.

## Verification

`npm run check` green. In the browser, run through a close at 300x: the Days tab shows the report, its
races add up to the day's immediate-or-cancel orders, and the bar matches the top bar's day P&L.
