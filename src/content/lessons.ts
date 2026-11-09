// The guided first week: a lesson is something to do, something to watch for, a check the game runs on its
// own snapshot, and what it meant once it has happened. The order is the path a new player walks, and is the
// order of the stages (see stages.ts): home, seat | gap, race, cost | maker, noise | hand, used, week.

import type { Snapshot } from '../sim';

export interface Lesson {
  id: string;
  title: string;
  /** What to do, in a sentence or two. */
  task: string;
  /** What to look at while doing it. */
  watch: string;
  /** Glossary ids worth reading alongside. */
  terms: string[];
  done: (s: Snapshot) => boolean;
  /** Shown once done: what just happened, and why it matters. */
  lesson: string;
}

function fillsFor(s: Snapshot, block: string) {
  return s.fills.filter((f) => f.block === block);
}

function netOf(fills: { realised: number; fee: number }[]) {
  return fills.reduce((n, f) => n + f.realised - f.fee, 0);
}

export const LESSONS: Lesson[] = [
  {
    id: 'home',
    title: 'Find what earns from home',
    task: 'Momentum is on. The laptop runs one block at a time. Skip to the open, set the speed to 10×, and give it a few minutes.',
    watch: 'Momentum fills that close out with a realised gain, especially after a headline lands.',
    terms: ['momentum', 'news'],
    done: (s) => {
      const fills = fillsFor(s, 'momentum');
      return fills.length >= 10 && netOf(fills) > 0;
    },
    lesson:
      'Momentum does not need to be first: it rides a move that takes seconds to play out, which a slow firm ' +
      'can still catch. It pays the spread on every entry and exit, so it bleeds in a market that only wobbles, ' +
      'but it is the honest way to earn from a spare room. That is what pays for a better seat.',
  },
  {
    id: 'seat',
    title: 'Buy a better seat',
    task: 'Open the Shop. Compare the latency to each exchange before and after each office and network. Buy one.',
    watch: 'The data delay in the market panel’s heading, before and after. Every exchange gets nearer.',
    terms: ['colocation', 'microwave', 'capacity'],
    done: (s) => s.infra.location !== 'home' || s.infra.network !== 'consumer' || s.infra.computer !== 'laptop',
    lesson:
      'Every millisecond you cut is a race you now win that you used to lose. The firms that built microwave ' +
      'towers between Chicago and New Jersey did it for three milliseconds. The shop is the whole game in ' +
      'miniature: earn slowly, buy speed, earn faster.',
  },
  {
    id: 'gap',
    title: 'See two exchanges disagree',
    task: 'With the market open and the speed at 10×, watch the bid and ask on the HARBOR and LAKESIDE rows of any stock. The gap line under the rows shows one when it comes.',
    watch: 'A moment when one exchange’s ask is below the other’s bid. It lasts a fraction of a second.',
    terms: ['bid-ask', 'fair-value'],
    done: (s) => s.gapsSeen > 0,
    lesson:
      'That was a gap: the same stock cheaper to buy on one exchange than it could be sold for on the other. ' +
      'Each exchange’s crowd learns about a move at its own pace, so for a few hundred milliseconds they ' +
      'disagree. Buying on one and selling on the other in that moment is arbitrage, and it is what every firm ' +
      'in this market is racing for.',
  },
  {
    id: 'race',
    title: 'Lose a race',
    task: 'Switch momentum off and arbitrage on; the laptop runs one block. Let a few minutes of trading pass, then read the Orders list in your firm panel.',
    watch: 'An order marked Missed, with a rival’s name and how many milliseconds before you they arrived.',
    terms: ['latency', 'arbitrage'],
    done: (s) => s.orders.some((o) => o.block === 'arbitrage' && o.beatenBy.length > 0),
    lesson:
      'You saw the gap, sent the order, and the quote was gone before it arrived, taken by a firm sitting closer ' +
      'to the exchange. From a home office your view of the market is tens of milliseconds old and your order ' +
      'takes as long again to arrive. Nothing about your strategy was wrong. You were slow.',
  },
  {
    id: 'cost',
    title: 'Count what being slow costs',
    task: 'Keep arbitrage running until the Orders list has twenty finished races in it. Count the beaten against the won.',
    watch: 'Which exchange the beaten ones were on. PACIFIC is down the road; the other two are across the country.',
    terms: ['fill', 'maker-taker'],
    done: (s) => {
      const resolved = s.orders.filter((o) => o.block === 'arbitrage' && o.ioc && o.ackAt !== null);
      const won = resolved.filter((o) => o.filled >= o.size).length;
      const beaten = resolved.filter((o) => o.beatenBy.length > 0).length;
      return resolved.length >= 20 && beaten > won;
    },
    lesson:
      'More lost than won. The gaps you win are on the exchange fifteen milliseconds away; the ones you lose ' +
      'are forty away, where a leg fills and the other misses and the block gets flat again at the spread, ' +
      'plus a fee on every fill. Being slow has a price per race, and it is paid to whoever was faster.',
  },
  {
    id: 'maker',
    title: 'Get picked off as a market maker',
    task: 'Switch whatever is running off and the market maker on, with its half spread at two cents. Let it fill ten times.',
    watch: 'Fills that arrive just as the price moves through your quote, and the name on the race under them.',
    terms: ['market-maker', 'adverse-selection', 'inventory'],
    done: (s) => fillsFor(s, 'marketMaker').length >= 10,
    lesson:
      'A resting quote is an offer to everyone, and the ones who take it are the ones who know the price has ' +
      'moved. The crowd pulls its own stale quotes; yours sits there until a faster firm takes it. That is ' +
      'adverse selection, and it is why real market makers are the fastest firms of all. Widen the spread or ' +
      'step away on news, and it loses less; it does not win from here.',
  },
  {
    id: 'noise',
    title: 'Tell news from noise',
    task: 'Open the News tab and wait for a few headlines to settle. Any block can run meanwhile.',
    watch: 'Headlines marked with what they moved, and ones that moved nothing.',
    terms: ['news'],
    done: (s) => {
      const settled = s.news.filter((h) => s.now - h.at > h.priceInMs);
      return settled.some((h) => h.noise) && settled.some((h) => !h.noise);
    },
    lesson:
      'A headline that reads like news is not always news. An executive seen at an airport moves nothing; an ' +
      'earnings miss moves a lot, over about twenty seconds while the market prices it in. The news reaction ' +
      'block cannot tell them apart. You can, with practice: that is an edge a machine does not have yet.',
  },
  {
    id: 'hand',
    title: 'Trade by hand',
    task: 'Open the Desk. Send a 5,000-share market buy on Best, then step or run the clock until it has been sent and heard back.',
    watch:
      'The order’s race, and the name of whoever took the shares ahead of you, or the second exchange your order had to reach.',
    terms: ['slippage', 'order-anticipation', 'latency'],
    done: (s) => {
      const hand = s.orders.filter((o) => o.block === 'hand' && o.ioc);
      const beaten = hand.some((o) => o.ackAt !== null && o.beatenBy.length > 0);
      const exchanges = new Set(s.fills.filter((f) => f.block === 'hand').map((f) => f.exchange));
      return beaten || exchanges.size >= 2;
    },
    lesson:
      'A person takes about a quarter of a second to click, which is a hundred and twenty-five ticks to a ' +
      'colocated firm. A large order prints on one exchange and a faster firm has already bought on the others ' +
      'by the time yours reaches them, and offers you the shares back a cent dearer. That is slippage. The ' +
      'order did what the screen said; the screen was the past.',
  },
  {
    id: 'used',
    title: 'See your order used',
    task: 'On the Desk, rest a 5,000-share limit bid a cent under the best bid and leave it for a few seconds, running the clock.',
    watch:
      'A level appearing in the book just in front of your bid, and whether yours fills when the price falls through it or not at all when it rises.',
    terms: ['order-anticipation', 'quote-fade', 'order-book'],
    // The snapshot does not say which book level is a rival's reply to the order, so this is the simpler check:
    // a resting hand limit order that has sat in the book for two seconds or more, still there or since filled.
    done: (s) =>
      s.orders.some((o) => {
        if (o.block !== 'hand' || o.ioc || o.size < 2000 || o.arrivedAt === null) return false;
        if (o.status === 'resting') return s.now - o.arrivedAt >= 2000;
        const lastFill = s.fills.filter((f) => f.localId === o.localId).reduce((t, f) => Math.max(t, f.at), 0);
        return o.status === 'filled' && lastFill - o.arrivedAt >= 2000;
      }),
    lesson:
      'A big resting order is a message to everyone who can read the book: someone wants to buy a lot here. A ' +
      'faster firm quotes a cent in front of it. If the price rises, it keeps the shares; if it falls, it sells ' +
      'them to you for a cent loss and you have bought on a falling price. Your order fills when the price ' +
      'is coming through it, and rarely when it is not. A resting order gives away what you mean to do.',
  },
  {
    id: 'week',
    title: 'Reach the second week',
    task: 'Play through to Friday’s close and over the weekend. Use skip to open for the evenings.',
    watch: 'The day P&L at each close, and whether a message arrives on the Dark web tab.',
    terms: ['insider', 'pnl'],
    done: (s) => s.calendar.week >= 2,
    lesson:
      'A week of trading days, each with its open, its lunch lull and its close. If you were up on the week, ' +
      'someone on the dark web has noticed. Read the glossary’s entry on insider trading before you take ' +
      'them up on it: the tips are sometimes real, the fines always are.',
  },
];

/** The futures desk's lessons: they open with the desk at stage 3 and open no stage (DESK_LESSONS in stages.ts). */
LESSONS.push(
  {
    id: 'basis',
    title: 'See the future lead the index',
    task: 'The futures desk is open. On the Market page watch IDX and the near IXF contract, and pick the contract.',
    watch:
      'The contract a few cents over the index (the basis), and, when the market moves, the contract’s price ' +
      'moving before the index’s does.',
    terms: ['future', 'basis', 'carry', 'lead-lag'],
    done: (s) =>
      s.stocks.some(
        (st) => st.contract && st.watched && s.stocks.find((u) => u.symbol === st.contract!.underlying)?.watched,
      ),
    lesson:
      'A future on the index is the index carried to its expiry: a few cents over it a week out, more further out, ' +
      'nothing on the day it ends. It trades at the Prairie Board, whose crowd catches a move in tens of ' +
      'milliseconds; the index’s crowds take hundreds. So the future moves first and the index follows. That ' +
      'gap in time is the desk’s whole lesson, and what a seat near the Prairie Board is for.',
  },
  {
    id: 'overnight',
    title: 'Trade a future through a close',
    task: 'From the Desk page, buy one IXF contract, and play on through the day’s close.',
    watch:
      'Your cash at the fill (only the fee goes), the margin to keep on the Overview, and the day’s report by desk.',
    terms: ['margin', 'variation-margin', 'margin-call'],
    done: (s) => s.days.some((d) => d.byDesk?.futures !== undefined),
    lesson:
      'You did not pay for the contract: you posted margin, a few hundred dollars against five thousand of index. ' +
      'At each close its gain or loss since its cost is paid in cash, and that price becomes its cost: a losing ' +
      'future is cash gone tonight, not a paper loss. Hold too many for your cash and a bad move is a margin ' +
      'call, flattened at whatever price there is.',
  },
  {
    id: 'lead',
    title: 'Ride the lead',
    task:
      'Turn lead-lag on and watch IDX and the near IXF contract. From home it sees the future too late; try it ' +
      'from a seat nearer the Prairie Board.',
    watch: 'Lead-lag’s fills in the index, and whether they close at a gain once the index catches up.',
    terms: ['lead-lag', 'latency', 'microwave'],
    done: (s) => {
      const fills = fillsFor(s, 'leadLag');
      return fills.length >= 10 && netOf(fills) > 0;
    },
    lesson:
      'Lead-lag never touches the future: it trades the index on what the future already says. Its whole edge is ' +
      'the few hundred milliseconds between the future’s crowd and the index’s, so it is worth exactly what ' +
      'your line to the Prairie Board and to the stock exchange is worth. The firms that built towers across the ' +
      'plains did it for this trade.',
  },
);

/** The currencies desk's lessons: they open with the desk at stage 4 and open no stage (DESK_LESSONS in stages.ts). */
LESSONS.push(
  {
    id: 'pips',
    title: 'Count in pips',
    task:
      'The currencies desk is open. Put EURUSD, the euro in dollars, on your watchlist; from the Desk page buy ten ' +
      'lots of it, and watch the price for a minute or two.',
    watch:
      'The price’s four places, the last of them a pip; your euro balance and your dollar cash moving at the fill; ' +
      'and the position’s P&L, a dollar for each pip the price moves.',
    terms: ['pip', 'lot', 'currency-pair', 'base-quote', 'home-currency'],
    done: (s) => s.fills.some((f) => f.block === 'hand' && s.stocks.some((st) => st.symbol === f.symbol && st.pair)),
    lesson:
      'A currency is priced in another, so a price is a ratio: 1.0850 dollars for a euro. It moves by a few ' +
      'hundredths of a cent a minute, so it is written to four places and counted in pips, the fourth. A lot is ' +
      'a thousand euros, so a pip of a lot is ten cents and a pip of ten lots a dollar. You did not spend dollars ' +
      'on a thing: you swapped them for euros, and hold euros now, worth whatever the next price says.',
  },
  {
    id: 'triangle',
    title: 'Close a triangle',
    task:
      'Put EURUSD, USDJPY and EURJPY on your watchlist and turn on triangular arbitrage. From home it sees the cross ' +
      'too late; try it from the rack in Eastholm.',
    watch:
      'Three orders leaving together when the dollar moves; whether all three fill; and what is left in each ' +
      'currency once they have.',
    terms: ['triangular-arbitrage', 'cross-rate', 'currency-pair'],
    done: (s) => {
      const legs = new Set(s.fills.filter((f) => f.block === 'triangle').map((f) => f.symbol));
      const crosses = s.stocks.filter((st) => st.pair?.cross);
      return crosses.some(
        (x) =>
          legs.has(x.symbol) && s.stocks.filter((st) => st.pair && !st.pair.cross).every((l) => legs.has(l.symbol)),
      );
    },
    lesson:
      'The euro in yen has to be the euro in dollars times the dollar in yen, or there is money for nothing in ' +
      'going round the three. When the dollar moves, its two pairs reprice first and the cross is slow, and for ' +
      'a moment the circle does not close. Sell the dear side, buy the cheap, and you hold what you held before, ' +
      'bar a few yen. It is three races at once: lose one and you hold a position you never wanted.',
  },
  {
    id: 'refused',
    title: 'Be refused',
    task:
      'Set the triangle’s venue to the dealer, which charges no fee, and run it from the rack in Eastholm until the ' +
      'dealer turns an order down.',
    watch: 'An order in your list marked “refused”, and its race: the dealer held it a few milliseconds, then said no.',
    terms: ['dealer', 'last-look', 'market-maker'],
    done: (s) => s.orders.some((o) => o.status === 'refused'),
    lesson:
      'The dealer quotes a price and keeps the right to look at your order before it fills. If its price has ' +
      'moved against it while it looked, it refuses. That is the maker’s free option, the one stale quotes give ' +
      'away, kept by the maker this time: the faster you are, the more often you catch its price before it ' +
      'moves, and the more often it says no. No fee, and no fill when it matters.',
  },
  {
    id: 'rollover',
    title: 'Earn the rollover',
    task:
      'Turn carry on and let it hold its pair through 17:00, when the currencies roll to the next day. Wednesday ' +
      'pays three nights.',
    watch: 'The rollover in that day’s report, in dollars, and the day’s P&L with it.',
    terms: ['rollover', 'carry', 'home-currency'],
    done: (s) => s.days.some((d) => (d.rollover ?? 0) > 0),
    lesson:
      'Holding the dollar against the yen is lending dollars and borrowing yen, so each night you are paid the ' +
      'dollar’s interest and charged the yen’s, less a little the venue keeps. It is a few pips a night for doing ' +
      'nothing, and a bad hour can take a month of it: carry is paid for sitting still while the price is free to ' +
      'move against you. The market never closes in the week, so neither does the risk.',
  },
);

export function lesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
