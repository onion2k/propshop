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
    id: 'momentum',
    term: 'Momentum',
    short: 'A move that keeps going for a moment, because the orders behind it are still arriving.',
    long:
      'Big orders are sliced up and fed in over time, so a price that has started moving often keeps moving for a ' +
      'few seconds. Momentum strategies ride that. They pay the spread on every entry and exit, so in a market ' +
      'that only wobbles they bleed.',
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
      'than another; the race then moves to the line between exchanges.',
  },
  {
    id: 'microwave',
    term: 'Microwave links',
    short: 'Beaming orders between cities through the air, faster than fibre.',
    long:
      'Light in fibre runs at two thirds of its speed in air, and fibre routes follow roads and railways. A chain ' +
      'of microwave towers in a straight line beats it by a third or more. The firms that built them between ' +
      'Chicago and New Jersey spent fortunes to shave a few milliseconds.',
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
