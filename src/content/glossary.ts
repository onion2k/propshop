// What the player is learning, one entry a term. The UI links to these wherever the term is used.

export interface GlossaryEntry {
  id: string;
  term: string;
  short: string;
  long: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'order-book',
    term: 'Order book',
    short: 'Every resting order to buy or sell a stock, sorted by price.',
    long:
      'An exchange keeps a list of everyone willing to buy and at what price (the bids) and everyone willing to ' +
      'sell (the asks). The best bid is the highest price anyone will pay; the best ask is the lowest anyone will ' +
      'take. When a new order crosses the gap between them, it trades against the orders waiting there, best price ' +
      'first, and among equal prices the oldest first.',
  },
  {
    id: 'bid-ask',
    term: 'Bid, ask and spread',
    short: 'The best buying price, the best selling price, and the gap between them.',
    long:
      'If the best bid is 41.00 and the best ask is 41.01, the spread is a cent. Anyone who wants to trade right ' +
      'now pays it: a buyer pays the ask, a seller gets the bid. The midpoint between them is the market’s best ' +
      'guess at the price, and the one the game draws on the chart.',
  },
  {
    id: 'limit-order',
    term: 'Limit order and IOC',
    short: 'An order with a price it will not go past; IOC means fill now or forget it.',
    long:
      'A limit buy at 41.01 will pay 41.01 or less, never more. If nothing is for sale at that price it rests in ' +
      'the book and waits. An immediate-or-cancel (IOC) order does not wait: whatever cannot fill at once is ' +
      'cancelled. Arbitrage uses IOC because a stale leg left resting is a position you did not want.',
  },
  {
    id: 'post-only',
    term: 'Post-only',
    short: 'An order that will rest or be refused, never take.',
    long:
      'A maker wants to be the one waiting, not the one crossing: resting pays no fee and earns the spread, ' +
      'taking pays a fee and gives it up. A post-only order says so to the exchange: if it would cross the ' +
      'spread on arrival, because the market moved while it was on its way, it is refused rather than filled. ' +
      'The market maker block sends every quote post-only, and the refusals show in your orders with their ' +
      'reason.',
  },
  {
    id: 'iceberg',
    term: 'Iceberg order',
    short: 'A large order that shows only a slice of itself at a time.',
    long:
      'A thousand shares shown in the book tells everyone you are there, and they trade around you. An ' +
      'iceberg shows a hundred, and when that fills, shows the next hundred, at the back of the queue each ' +
      'time. The ladder shows what is shown, which is why a level can keep refilling at the same price. In a ' +
      'script, `buy` and `sell` take `{ display: 100 }`.',
  },
  {
    id: 'fill',
    term: 'Fill',
    short: 'A trade: your order met someone else’s.',
    long:
      'An order can fill in full, in part, or not at all. A partial fill leaves the rest resting (or cancelled, for ' +
      'an IOC). Every fill costs a fee per share to the exchange, and the fee is the difference between an edge ' +
      'that pays and one that does not.',
  },
  {
    id: 'maker-taker',
    term: 'Maker and taker fees',
    short: 'The order that crosses the spread pays the exchange; the one that was waiting does not.',
    long:
      'Exchanges want deep books, so they charge the aggressive side (the taker) a fraction of a cent a share and ' +
      'let the resting side (the maker) trade free, or even pay it a rebate. For a market maker that is most of ' +
      'the business model. For an arbitrageur, who takes on both legs, it is the cost that decides whether a ' +
      'one-cent gap is worth crossing for.',
  },
  {
    id: 'fair-value',
    term: 'Fair value',
    short: 'What the stock is really worth right now, which nobody knows exactly.',
    long:
      'In the game there is a true fair value that wanders and jumps on news. Each exchange’s crowd has its ' +
      'own slightly late, slightly noisy idea of it, and quotes around that. The gaps between the two crowds’ ' +
      'ideas are what arbitrage eats. The faint line on the chart is the true value, which real traders never see.',
  },
  {
    id: 'latency',
    term: 'Latency',
    short: 'How long a message takes to get from you to the exchange, or back.',
    long:
      'Light in fibre covers about 200 km a millisecond. From a home office across the country, an order takes ' +
      'tens of milliseconds to arrive, and you are looking at a market tens of milliseconds old. A firm in the ' +
      'exchange’s own building is a thousand times closer. In a race for the same cent, the lower latency ' +
      'wins every time.',
  },
  {
    id: 'arbitrage',
    term: 'Arbitrage',
    short: 'Buying and selling the same thing at once, at two prices, for the difference.',
    long:
      'When one exchange’s ask is below another’s bid, buying at the first and selling at the second ' +
      'locks in the gap. It is riskless if both legs fill. It is not riskless if only one does, which is what ' +
      'happens to the firm that gets there second: the other leg has already been taken.',
  },
  {
    id: 'market-maker',
    term: 'Market maker',
    short: 'A firm that quotes both sides and earns the spread.',
    long:
      'Market makers rest a bid and an ask around the midpoint and trade with whoever comes along, earning the ' +
      'spread each time. They provide liquidity: without them, the book would be empty and the spread wide. ' +
      'Their risk is inventory: when the price moves, their quotes on the wrong side keep filling.',
  },
  {
    id: 'inventory',
    term: 'Inventory risk',
    short: 'Being stuck holding stock while the price moves against you.',
    long:
      'A market maker who has bought all morning is long a lot of stock. If the price then falls, every share loses. ' +
      'Skewing quotes (bidding lower, offering lower) leans the flow back toward flat, and a hard limit stops the ' +
      'pile growing.',
  },
  {
    id: 'adverse-selection',
    term: 'Adverse selection',
    short: 'The trades you get are the ones nobody else wanted: your quote was stale and someone knew.',
    long:
      'A resting quote is a free option for everyone else. When the price moves, the crowd pulls its own quotes ' +
      'at the old price, and whoever is slowest to pull is left alone at the top of the book, where the fast ' +
      'firms take it. So a market maker\u2019s fills cluster right before the price moves against them. The ' +
      'defences are speed, quoting off the freshest venue, stepping away on news, and keeping inventory small. ' +
      'Try the market maker block from the home office and watch the race replay: the fills come after the ' +
      'quote went stale, and the name on them is the fastest rival.',
  },
  {
    id: 'momentum',
    term: 'Momentum',
    short: 'A move that keeps going for a moment, because the orders behind it are still arriving.',
    long:
      'Big orders are sliced up and fed in over time, so a price that has started moving often keeps moving for a ' +
      'few seconds. Momentum strategies ride that. They pay the spread on every entry and exit, so in a market ' +
      'that only wobbles they bleed.',
  },
  {
    id: 'mean-reversion',
    term: 'Mean reversion',
    short: 'A price that has lurched tends to come part of the way back.',
    long:
      'A lurch is often one trader\u2019s hurry: an order too big for the touch walks the book, and once it is ' +
      'done the crowd re-centres. Fading the lurch collects that. It is the mirror of momentum and it loses the ' +
      'mirror way: on a day that trends, the average lags the price all session and every fade is run over. ' +
      'Which of the two to run is a question about the day, not the strategy.',
  },
  {
    id: 'stale-quote',
    term: 'Stale quotes',
    short: 'A quote on one exchange that has not caught up with the price on the others.',
    long:
      'When news or a burst of orders moves the price, each exchange\u2019s crowd hears at its own pace. For a ' +
      'moment one of them still quotes the old price. That quote is free money to whoever reaches it first, ' +
      'and the firm that posted it is the one who pays: picked off. The sniper block takes stale quotes; the ' +
      'market maker block is what gets taken. Every firm in this market is on one side of that or the other.',
  },
  {
    id: 'order-anticipation',
    term: 'Order anticipation',
    short: 'Trading ahead of a large order that the tape or the book has already given away.',
    long:
      'A big order cannot hide. Sent as one it prints large on the tape; resting, it shows as a wall in the ' +
      'book. A fast firm reads either and acts first: buy on the other exchanges before a sweep reaches them ' +
      'and offer the shares back a cent dearer, or quote a cent in front of a big resting bid and sell into it ' +
      'if the price turns. The large order\u2019s owner pays a cent or two a share for being seen. Nothing is ' +
      'predicted: it is reading, faster. Direct exchange feeds show every order and every print, which is what the rival reads; a level is a sum of many small orders and says little, but one big order in it does. The anticipate block does both, and a market maker answers by pulling ' +
      'its quote when a big print hits that side elsewhere.',
  },
  {
    id: 'fpga',
    term: 'FPGA',
    short: 'A chip whose logic is the strategy itself: no software between the price and the order.',
    long:
      'A field-programmable gate array is wired, rather than programmed, to do one job. A strategy burned into ' +
      'one reads the market and sends the order in the time signals take to cross the chip, which is far less ' +
      'than software on a server needs. Decisions here come every tick. It costs a great deal and is hard to ' +
      'change, which is the trade: the fastest firms run them because at their speed a software stack is the ' +
      'slowest thing in the path.',
  },
  {
    id: 'factors',
    term: 'Factors and correlation',
    short: 'Stocks move together: with the market, with their sector, and on their own.',
    long:
      'A stock\u2019s move on any day is partly the whole market\u2019s move, scaled by its beta, partly its ' +
      'sector\u2019s, and partly its own. The game draws a market factor and a factor per sector each tick, and ' +
      'every stock takes its share. That is why two technology stocks rise and fall together more than a ' +
      'technology stock and a utility do, and why there is such a thing as a pair.',
  },
  {
    id: 'pairs',
    term: 'Pairs trading',
    short: 'Two stocks that move together, traded against each other when they come apart.',
    long:
      'If two stocks share a sector, the ratio of their prices wanders far less than either price. When the ' +
      'ratio strays, one has moved and the other has not yet; sell the leader and buy the laggard, and the two ' +
      'usually come back in line. The risk is that one of them had a reason of its own to move, which is what ' +
      'company news is: that is why the block steps out of a pair for a while after a headline names either.',
  },
  {
    id: 'index-arb',
    term: 'Index arbitrage',
    short: 'The index against its basket: when they disagree, buy one and sell the other.',
    long:
      'An index is worth the average of the stocks in it, and it trades as if it were a stock, so for a moment ' +
      'it can be cheap or dear against its basket. Buying the cheap one and selling the dear one locks in the ' +
      'difference once they meet again. Doing it takes an order for the index and one for every stock in the ' +
      'basket, at once: a computer that can only send so many a second is left with a leg or two, which is ' +
      'the oldest reason there is to buy a bigger one.',
  },
  {
    id: 'watchlist',
    term: 'Watchlist and scale',
    short: 'A computer can follow so many symbols; the firm chooses which.',
    long:
      'Real high-frequency firms watch thousands of names, and the edge per name is tiny: the business is ' +
      'scale. In the game a laptop can follow four symbols, a server eight and a rack all of them; an FPGA, the top tier, decides every tick (see the FPGA entry). The blocks ' +
      'see only what is watched, so a pair needs both its stocks on the list and index arbitrage needs the ' +
      'whole basket. Pick the list on the market page.',
  },
  {
    id: 'pnl',
    term: 'P&L: realised and unrealised',
    short: 'Money made on trades you have closed, and on positions you still hold.',
    long:
      'Realised P&L is locked in: you bought at 41.00 and sold at 41.03. Unrealised P&L is on paper: you hold ' +
      'shares bought at 41.00 and the market is now 41.02, so you are up two cents a share until you sell, or ' +
      'until it moves. Fees and fines come off the top.',
  },
  {
    id: 'colocation',
    term: 'Colocation',
    short: 'Renting a rack inside the exchange’s own data centre.',
    long:
      'The exchange sells space next to its matching engine, and firms pay for it because a metre of cable is ' +
      'faster than a kilometre. Exchanges give every colocated firm the same length of cable so none is faster ' +
      'than another; the race then moves to the line between exchanges. With a rack at each, an order leaves ' +
      'from the rack beside its exchange and lands at once, and what still takes time is the other ' +
      'exchange\u2019s quote crossing the link: the game shows that as data latency apart from order latency.',
  },
  {
    id: 'microwave',
    term: 'Microwave links',
    short: 'Beaming orders between cities through the air, faster than fibre.',
    long:
      'Light in fibre runs at two thirds of its speed in air, and fibre routes follow roads and railways. A chain ' +
      'of microwave towers in a straight line beats it by a third or more. The firms that built them between ' +
      'Chicago and New Jersey spent fortunes to shave a few milliseconds, and then laid lasers between rooftops ' +
      'to shave the microseconds after that. Each link has weather it cannot cross, so the slower ones stay.',
  },
  {
    id: 'news',
    term: 'News and pricing in',
    short: 'A headline changes what a stock is worth; the price takes a moment to follow.',
    long:
      'When news lands, fair value jumps at once, but the price moves there over seconds as traders read it, ' +
      'decide, and the exchanges catch up. Firms that parse headlines by machine trade in that gap. Not every ' +
      'headline is news: a chief executive seen at an airport moves nothing, and a strategy that trades on it ' +
      'pays the spread for nothing.',
  },
  {
    id: 'insider',
    term: 'Insider trading',
    short: 'Trading on material information the public does not have. Illegal.',
    long:
      'Knowing tomorrow’s headline today is the surest edge there is, and the one that ends careers. The ' +
      'game’s dark web sells tips so the player can see the shape of it: some tips are real, some are made ' +
      'up, the price tells you nothing, and every purchase adds to the regulator’s file on you. Heat cools ' +
      'over time, and above the line the fines start.',
  },
  {
    id: 'capacity',
    term: 'Capacity',
    short: 'How many blocks your computer runs, how often it decides, how many orders it can send.',
    long:
      'A strategy that decides every fifty milliseconds is a strategy that misses everything that happens in ' +
      'between. Orders beyond the machine’s limit are dropped. Faster hardware is as much a part of HFT as ' +
      'a faster line.',
  },
  {
    id: 'risk-limits',
    term: 'Risk limits',
    short: 'A loss on the day that halts you, and an exposure the firm may not exceed.',
    long:
      'Every trading firm has a risk officer whose job is to say no. Two of their rules are here. A daily loss ' +
      'limit: down that much on the day and the book is halted until the next open, resting orders pulled and ' +
      'positions flattened at whatever the market will give. A leverage: the gross value of what you hold and ' +
      'have resting may not pass your equity times it, and an order that would is refused before it leaves. ' +
      'The first bounds a bad day; the second bounds a bad script.',
  },
  {
    id: 'quote-stuffing',
    term: 'Quote stuffing',
    short: 'Flooding an exchange with orders you cancel at once. The regulator calls it manipulation.',
    long:
      'Sending thousands of orders and cancelling nearly all of them clogs the exchange\u2019s feed and the ' +
      'competition\u2019s view of it, which is sometimes the point. Regulators treat a high cancel rate on a ' +
      'high order count as a pattern worth a letter, and a flood of orders past what your connection can carry ' +
      'as another. In the game, either at the close adds to your heat, and the fines that heat brings follow.',
  },
  {
    id: 'regimes',
    term: 'Market regimes',
    short: 'Kinds of day: calm, trending, choppy, news-heavy. The right block depends on which.',
    long:
      'Markets have moods, and a strategy tuned to one loses in another. On a calm day little happens and the ' +
      'maker earns the bounce. On a trending day each stock sets off and keeps going, which momentum rides and ' +
      'a maker leans against all day. On a choppy day the exchanges disagree often, which arbitrage lives on, ' +
      'and momentum bleeds. On a news-heavy day the headlines come all session, and the news reaction block ' +
      'has its day. The top bar names the day from the open; the day report keeps it; the player switches.',
  },
  {
    id: 'market-structure',
    term: 'Market structure',
    short: 'The rules a market runs by, which decide who can earn in it.',
    long:
      'Continuous matching by price and then time is a choice, and it is the choice that makes speed worth ' +
      'paying for. Other choices have been built or proposed: a speed bump in front of the matching engine, ' +
      'batches that match everyone at once, a tax on every trade, a minimum time a quote must stand, a wider ' +
      'tick. Each one blunts some strategies and spares others. The lab lets you run them here and watch who ' +
      'earns, which is the whole argument about high-frequency trading in one afternoon.',
  },
  {
    id: 'hft',
    term: 'High-frequency trading',
    short: 'Trading by machine, in large numbers, on tiny edges, as fast as physics allows.',
    long:
      'HFT firms hold positions for seconds or less and make a fraction of a cent a share, millions of times a ' +
      'day. The edges come from being faster: seeing a quote change first, reaching the book first. The business ' +
      'is an arms race in latency, which is what this game is about.',
  },
];

export function glossary(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.id === id);
}
