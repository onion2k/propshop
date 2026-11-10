// The guided first week: a lesson is something to do, something to watch for, a check the game runs on its
// own snapshot, and what it meant once it has happened. The order is the path a new player walks, and is the
// order of the stages (see stages.ts): home, seat | gap, race, cost | maker, noise | hand, used, week.

import type { Snapshot } from '../sim';
import { IXF } from './futures';
import { OPTION_SERIES } from './options';

/** The pages a lesson can take the player to: the pages of the app. */
export const GO_PAGES = ['overview', 'market', 'desk', 'strategy', 'reports'] as const;
/** The tabs of the Reports page. */
export const GO_TABS = ['week', 'days', 'news', 'dark', 'rivals', 'lab', 'learn'] as const;
/** The `data-tut` names a lesson may point at: each is on the page its lesson names (a test holds it). */
export const GO_TARGETS = [
  'pages',
  'shop',
  'tabs',
  'desk-ticket',
  'speed',
  'firm',
  'watchlist',
  'quotes',
  'gaps',
  'overview',
  'risk',
  'strategy',
  'options',
] as const;

/** Where a lesson's "Take me there" goes: a page, a tab of Reports, and the element to outline. */
export interface Place {
  page: (typeof GO_PAGES)[number];
  tab?: (typeof GO_TABS)[number];
  /** A `data-tut` name from `GO_TARGETS`. */
  target?: (typeof GO_TARGETS)[number];
}

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
  /** Where to take the player to do it; every lesson has one. */
  go?: Place;
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
    go: { page: 'market', target: 'speed' },
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
    go: { page: 'strategy', target: 'shop' },
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
    go: { page: 'market', target: 'gaps' },
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
    go: { page: 'strategy', target: 'strategy' },
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
    go: { page: 'market', target: 'firm' },
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
    go: { page: 'strategy', target: 'strategy' },
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
    go: { page: 'reports', tab: 'news', target: 'tabs' },
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
    go: { page: 'desk', target: 'desk-ticket' },
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
    go: { page: 'desk', target: 'desk-ticket' },
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
    go: { page: 'overview', target: 'speed' },
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
    go: { page: 'market', target: 'watchlist' },
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
    go: { page: 'desk', target: 'desk-ticket' },
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
    go: { page: 'strategy', target: 'strategy' },
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
    go: { page: 'market', target: 'watchlist' },
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
    go: { page: 'strategy', target: 'strategy' },
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
    go: { page: 'strategy', target: 'strategy' },
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
    go: { page: 'strategy', target: 'strategy' },
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

type Row = Snapshot['stocks'][number];

/** The watched futures on a watched metal: the rows a curve can be read from. */
function watchedCurves(s: Snapshot): Row[] {
  const metals = new Set(s.stocks.filter((st) => st.metal && st.watched).map((st) => st.symbol));
  return s.stocks.filter((st) => st.watched && st.contract && metals.has(st.contract.underlying));
}

/** How long after a fix a fill told of it can still be the fix's: the slowest seat's latency, and a margin. */
const FIX_TOLD_WITHIN = 2000;

/** The metals desk's lessons: they open with the desk at stage 5 and open no stage (DESK_LESSONS in stages.ts). */
LESSONS.push(
  {
    id: 'curve',
    go: { page: 'market', target: 'watchlist' },
    title: 'Read the curve',
    task:
      'The metals desk is open. Put XAU, gold, and its near GC future on your watchlist; a laptop watches four ' +
      'symbols. Open gold on the Market page and find its curve.',
    watch:
      'Spot and the three weekly futures set against their dates, each a little dearer than the one before, and the ' +
      'carry under them: the dollar’s rate and storage, less the lease.',
    terms: ['futures-curve', 'spot', 'contango', 'storage', 'lease-rate'],
    done: (s) => watchedCurves(s).length > 0,
    lesson:
      'A contract for gold next Friday is gold now carried to next Friday: the interest on what it cost and a week ' +
      'of storage, less what lending it out would earn. That is why the curve rises, and by how much. It is not a ' +
      'forecast that gold will be dearer; it is the price of waiting. When the curve and the carry disagree, one of ' +
      'the points is mispriced, and a calendar spread trades the gap.',
  },
  {
    id: 'flip',
    go: { page: 'reports', tab: 'news', target: 'tabs' },
    title: 'Watch it flip',
    task:
      'Keep gold or silver and one of its futures on your watchlist, with the curve open, and play on until a supply ' +
      'headline lands: a strike, or a fire at a refinery. The News tab marks the metals desk’s.',
    watch:
      'The lease jumping with the headline, the carry turning below nothing, and the later futures falling under ' +
      'spot: the curve named backwardation.',
    terms: ['backwardation', 'lease-rate', 'contango', 'futures-curve'],
    done: (s) => s.deskNews.some((h) => h.desk === 'metals') && watchedCurves(s).some((st) => st.contract!.carry < 0),
    lesson:
      'Metal short now is worth more now than later. Whoever holds it can lend it at a lease above the interest and ' +
      'storage it costs to keep, so the futures fall below spot and the curve slopes down. A headline did that in ' +
      'a minute; the lease decays over a day or two and the curve comes back. A spread that bet on contango is ' +
      'on the wrong side while it lasts, which is why the curve block has a stop.',
  },
  {
    id: 'delivery',
    go: { page: 'desk', target: 'desk-ticket' },
    title: 'Take delivery',
    task:
      'Buy one GC contract, the week’s, from the Desk page, and hold it through Friday’s expiry at 13:30, then on to ' +
      'the evening.',
    watch:
      'The future gone from your positions and gold in its place, paid for in cash at the final price; and at 17:00 ' +
      'the storage in the day’s report, three nights of it on a Friday.',
    terms: ['delivery', 'storage', 'spot', 'future', 'margin'],
    done: (s) => s.positions.some((p) => (p.delivered ?? 0) !== 0) && s.days.some((d) => d.storage !== undefined),
    lesson:
      'The future cost you a margin. The metal cost its whole price, out of your cash, and it goes on costing: ' +
      'storage every night until it is sold, and on a Friday afternoon there is nowhere to sell it, since both spot ' +
      'venues are shut until Port Sundar opens on Sunday evening. A trader who wants the exposure and not the bars ' +
      'rolls to the next contract the day before. Holding a future into expiry is a decision to own the metal.',
  },
  {
    id: 'fix',
    go: { page: 'desk', target: 'desk-ticket' },
    title: 'Trade the fix',
    task:
      'Put XAU on your watchlist. At 09:59:30 Thamesford stops trading for the 10:00 fix; while the call runs, rest ' +
      'a limit buy or sell on THAMESFORD from the Desk page, priced through the indicative, and run the clock past 10:00.',
    watch:
      'The fix line counting down with the indicative price and volume; a market order refused in the call; and ' +
      'your fill at the fix’s one price, the same as everyone else’s.',
    terms: ['fix', 'call-auction', 'uncrossing-price', 'fix-flow'],
    done: (s) => {
      const fixes = s.exchanges.flatMap((e) => (e.fixes ?? []).map((f) => ({ ...f, venue: e.id })));
      return s.fills.some((f) =>
        fixes.some(
          (x) =>
            x.venue === f.exchange &&
            x.symbol === f.symbol &&
            x.price === f.price &&
            f.at >= x.at &&
            f.at - x.at <= FIX_TOLD_WITHIN,
        ),
      );
    },
    lesson:
      'Everyone who crossed at the fix paid the same price, however far through it they bid, and nobody paid a ' +
      'spread. That is what a large order wants: all of it at once, at one price, with the whole market there. The ' +
      'price is set by what was in the call, though, and clients send their orders for the fix late and often on ' +
      'one side, so the fix can land a little off what the metal is worth. A firm beside Thamesford sees that ' +
      'imbalance in time to rest against it; one across the ocean does not.',
  },
  {
    id: 'miner',
    go: { page: 'strategy', target: 'strategy' },
    title: 'The miner and the metal',
    task:
      'Put RDG, Ridgeline Mining, and XAU on your watchlist and turn on pairs across desks, set to the miner ' +
      'against gold. Run it through a morning when Thamesford is open.',
    watch:
      'Both legs filling together when the ratio leaves its band, a stock on one desk against a metal on another, ' +
      'and whether the ratio comes back.',
    terms: ['miner', 'pairs', 'spot'],
    done: (s) => {
      const legs = new Set(s.fills.filter((f) => f.block === 'crossPairs').map((f) => f.symbol));
      const metal = s.stocks.some((st) => st.metal && legs.has(st.symbol));
      const stock = s.stocks.some((st) => !st.metal && !st.contract && !st.pair && legs.has(st.symbol));
      return metal && stock;
    },
    lesson:
      'A miner is a bet on the metal with a company wrapped round it: its costs, its own news, and the stock ' +
      'market’s mood. Most days the two move together and the ratio between them wanders in a band; pairs sells ' +
      'whichever is dear and buys the other, and waits. It is a bet that the link holds. A strike at the mine moves ' +
      'one leg and not the other, and then the band is no comfort.',
  },
);

/** The options desk's symbols: a series' root and its day. A listed option is gone by the time its fills are read. */
const OPTION_SYMBOL = new RegExp(`^(${OPTION_SERIES.map((x) => x.root).join('|')})\\d+$`);
const FUTURE_SYMBOL = new RegExp(`^${IXF.root}\\d+$`);

/** Whether a fill was of an option, and whether of a call, a put, or the index future that hedges them. */
const kindOf = (symbol: string): 'call' | 'put' | 'future' | null => {
  if (FUTURE_SYMBOL.test(symbol)) return 'future';
  if (!OPTION_SYMBOL.test(symbol)) return null;
  const root = OPTION_SERIES.find((x) => symbol.startsWith(x.root));
  return root?.contract.right ?? null;
};

/** The options the day reports settled, every day kept. */
const expiries = (s: Snapshot) => s.days.flatMap((d) => d.expired ?? []);

/** The options desk's lessons: they open with the desk at stage 6 and open no stage (DESK_LESSONS in stages.ts). */
LESSONS.push(
  {
    id: 'insure',
    go: { page: 'market', target: 'options' },
    title: 'Buy insurance',
    task:
      'The options desk is open. On the Market page press Watch the chain, then from the Desk page buy one put a ' +
      'strike or so below the index, and hold it through the 16:00 close.',
    watch:
      'The premium leaving your cash at the fill, the put worth less as the afternoon runs on, and, in the day’s ' +
      'report, what it settled at and what it made against what it cost.',
    terms: ['put', 'premium', 'strike', 'out-of-the-money', 'intrinsic-value', 'cash-settlement'],
    done: (s) => expiries(s).some((x) => x.right === 'put' && x.qty > 0),
    lesson:
      'The premium is the price of a floor. If the index finishes above the strike the put is worth nothing and the ' +
      'premium is gone, as a year’s fire insurance is when the house does not burn. If it falls through the strike ' +
      'the put pays the difference, whatever the index has done, and that is the most you can ever have lost on the ' +
      'shares it protected. Most days the insurance does not pay; that is how the seller of it earns.',
  },
  {
    id: 'implied',
    go: { page: 'market', target: 'options' },
    title: 'Implied against realised',
    task:
      'Press Watch the chain. Then, from the Desk page, sell one call and one put at the same strike, the one nearest ' +
      'the index, and hold both through the close. That is a short straddle.',
    watch:
      'The chain’s line for the move the market expects, the implied volatility at the money against the realised, ' +
      'and then what the index actually did by 16:00 against the premium you took in.',
    terms: ['implied-volatility', 'realised-volatility', 'volatility-premium', 'time-value', 'premium'],
    done: (s) => {
      const sold = expiries(s).filter((x) => x.qty < 0);
      return sold.some((c) => c.right === 'call' && sold.some((p) => p.right === 'put' && p.strike === c.strike));
    },
    lesson:
      'An option is priced on the volatility the market expects, the implied, and settled on the volatility the ' +
      'index delivers, the realised. A seller takes the first and pays the second. Priced a little over what usually ' +
      'happens, the straddle seller wins on most quiet days, a few cents at a time, and loses badly on a day the ' +
      'index runs: the premium is the reward for being the one who is run over. It is a fair price on average, not a ' +
      'gift, and a trending or news-heavy day is where it is collected.',
  },
  {
    id: 'hedge',
    go: { page: 'market', target: 'options' },
    title: 'Hedge the delta',
    task:
      'Press Watch the chain, then turn on the option maker (hedge on) from a seat that sees the Prairie Board’s ' +
      'future quickly, and let it run for a while. Or sell a call by hand and hedge it yourself with the future.',
    watch:
      'The Position block’s delta for the desk, the futures it says would hedge it, and the maker’s fills in the ' +
      'future keeping it near nothing as the options fill.',
    terms: ['delta', 'delta-hedge', 'gamma', 'future'],
    done: (s) => {
      const mine = fillsFor(s, 'optionMaker').map((f) => kindOf(f.symbol));
      return mine.filter((k) => k === 'call' || k === 'put').length >= 10 && mine.includes('future');
    },
    lesson:
      'A call bought is a bet that the index goes up, half a unit for every unit it does, its delta. The maker holds ' +
      'whatever the customers leave it, which is a bet on the index it never meant to make, so it sells the future ' +
      'against it until the net is near nothing. What is left is not a view on direction at all: the options’ ' +
      'curvature, their gamma, and what they cost to hold, their theta. The hedge costs the future’s spread each ' +
      'time, which is why it works inside a band and not every tick.',
  },
  {
    id: 'gamma',
    go: { page: 'market', target: 'options' },
    title: 'Gamma on a trending day',
    task:
      'Press Watch the chain, run the option maker hedged, and play on until a trending or news-heavy day has ' +
      'closed. The day’s report names the kind of day.',
    watch:
      'The Position block’s gamma and theta, the maker’s result by day in the report, and which days it earned ' +
      'on and which it gave back.',
    terms: ['gamma', 'theta', 'regimes', 'delta-hedge'],
    done: (s) =>
      s.days.some((d) => (d.regime === 'trending' || d.regime === 'news') && (d.byBlock.optionMaker?.fills ?? 0) > 0),
    lesson:
      'Short an option, a maker is paid its theta, a little every minute, and charged its gamma: each move of the ' +
      'index, up or down, makes the position worse in a way the hedge, chasing, always arrives a step late for. On a ' +
      'quiet day the theta is larger and the maker keeps it. On a day the index goes one way, the moves add up and ' +
      'the gamma costs more than the theta paid. The hedge takes away the direction and leaves exactly this: a market ' +
      'maker in options is short the index’s movement, and is paid for it only in the days that do not.',
  },
  {
    id: 'parity',
    go: { page: 'market', target: 'options' },
    title: 'Find parity',
    task:
      'Press Watch the chain, then turn on parity from a seat that sees the Prairie Board quickly, and play on past ' +
      'a headline. A call, a put and the future are tied by one price; when they come apart it trades all three.',
    watch:
      'A call bought, a put sold and the future sold (or the reverse) in one moment, and the three prices at that ' +
      'moment: the call less the put against the future less the strike.',
    terms: ['put-call-parity', 'conversion', 'call', 'put', 'future'],
    done: (s) => {
      const kinds = new Set(fillsFor(s, 'parity').map((f) => kindOf(f.symbol)));
      return kinds.has('call') && kinds.has('put') && kinds.has('future');
    },
    lesson:
      'A call bought and a put sold at one strike pay exactly what the index does above the strike: it is the ' +
      'index, bought forward. So their prices differ by the index less the strike, and a future is the index bought ' +
      'forward too. When the options’ books are slow to follow a move the future has already made, that tie ' +
      'breaks for a moment, and trading all three locks in the gap with no view on where the index goes. Rare, ' +
      'small, and gone in the time it takes the slower books to catch up.',
  },
  {
    id: 'crush',
    go: { page: 'market', target: 'options' },
    title: 'Watch the crush',
    task:
      'Press Watch the chain. The day’s calendar lists the market-wide releases by time. Turn on the event straddle ' +
      'and play through one: it buys a straddle ahead of the release and sells it before it lands.',
    watch:
      'The at-the-money implied volatility rising as the release comes closer, and, as it lands, falling away ' +
      'at once whichever way the index goes.',
    terms: ['the-crush', 'economic-calendar', 'implied-volatility', 'vega'],
    done: (s) => {
      const sides = new Set(
        fillsFor(s, 'eventVol')
          .filter((f) => kindOf(f.symbol) === 'call' || kindOf(f.symbol) === 'put')
          .map((f) => f.side),
      );
      return sides.has('buy') && sides.has('sell');
    },
    lesson:
      'Ahead of a known release the market adds a premium for the surprise, so a straddle costs more as the minute ' +
      'comes. Once the number is out the surprise has been spent, and the premium goes at once, whether the index ' +
      'jumped or not: the crush. A buyer of the straddle must be right about the size of the move by more than ' +
      'the premium; a seller before the release gives up the rise to be out of the fall. Owning volatility is not ' +
      'owning direction, and the date of the news is public.',
  },
);

export function lesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
