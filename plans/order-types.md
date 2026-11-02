# Order types and book depth

State: building, part 1 of 2.

## Context

Every order is a limit order, immediate-or-cancel or resting, and the ladder shows the crowd's shares with
the firm's lost among them. Real books have more: a post-only order that refuses to take, so a maker never
pays the taker fee by accident; an iceberg that shows a slice and keeps the rest hidden; and a sweep that
takes several levels at once. The market maker should quote post-only, scripts should have all three, and
the ladder should show which shares are yours.

## What is built

- **Post-only.** An order request may say `postOnly`; the book refuses it instead of matching when it would
  cross, and the firm marks it rejected with the reason "would have crossed the spread". The market maker's
  quotes are post-only, so a quote sent into a market that has moved through it is refused rather than
  filled as a taker. Rejected post-only orders are not races and do not count as drops.
- **Iceberg.** An order may carry a `display` size. The book shows at most that much of it in the quote and
  the depth; when the shown slice is used up and more remains, the order goes to the back of its price
  level with a fresh slice, as a real iceberg refreshes. Matching an incoming order against it takes only
  the shown slice before moving on.
- **Sweep.** A limit through the book already takes every level up to its price; the script API names it:
  `sweep(symbol, exchange, size, limit)` is a buy or sell immediate-or-cancel at that limit.
- **Your shares in the ladder.** `depth()` takes an owner and each level says how much of it is theirs; the
  ladder shows a "you" column.
- **Script API:** `buy` and `sell` take an options object in place of the `ioc` flag: `{ ioc, postOnly,
display }`. **Glossary:** post-only, iceberg.

## Parts

- [x] 1. The book: post-only refusal, iceberg slices and refresh, owner shares in depth; the firm's reason;
      the maker post-only; the script options; tests.
- [x] 2. The ladder's "you" column, the race sentence, the glossary; a UI test.

## Verification

`npm run check` green. In the browser the ladder shows the maker's shares in their own column, and a
post-only quote into a moved market shows as refused with its reason.
