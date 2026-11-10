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
    id: 'slippage',
    term: 'Slippage',
    short: 'What an order got, against the price on the screen when you clicked.',
    long:
      'You click on a price. By the time the order arrives, a quarter of a second of reaction and the trip to ' +
      'the exchange later, the market has moved, or someone faster has taken what you saw. Slippage is the ' +
      'gap between the price at the click and the price you were filled at, in cents a share. It is not always ' +
      'a loss: a quote can move your way. On a large order it is mostly the sweep itself, each exchange you ' +
      'reach being a little worse than the last, and the fast firms that read the first fill and get to the ' +
      'rest before you do.',
  },
  {
    id: 'quote-fade',
    term: 'Quote fade',
    short: 'The price you were about to take vanishing as you reach for it.',
    long:
      'A market maker\u2019s quote is an offer it will cancel the moment it learns the price is about to move. ' +
      'When a large order hits one exchange, the makers on the others pull their quotes before it arrives, ' +
      'because they can see the print and you cannot yet. The slow order finds the touch gone and walks to ' +
      'the next level. Nothing was wrong with the quote: it was shown to everyone and withdrawn from the ' +
      'slowest.',
  },
  {
    id: 'price-improvement',
    term: 'Price improvement',
    short: 'A fill at a better price than the one quoted when the order was sent.',
    long:
      'A buy that fills below the best ask, or a sell above the best bid, has been improved. It happens when ' +
      'the quote moves your way during the wait, or when someone offers a better price than the screen ' +
      'showed. Real brokers advertise it; here it is the negative side of slippage, and it is the market ' +
      'moving, not a favour.',
  },
  {
    id: 'payment-for-order-flow',
    term: 'Payment for order flow',
    short: 'A wholesaler paying a broker to receive its customers\u2019 orders.',
    long:
      'Most retail orders in the real world are not sent to an exchange. A broker sells them to a wholesaler, ' +
      'which fills them itself, usually at or a little better than the best quote, and pays the broker for the ' +
      'privilege. Retail orders are thought to be less informed than professional ones, which is why they are ' +
      'worth buying. This is an entry only: the wholesaler is not in the game yet, so your hand orders go to the ' +
      'exchanges directly and nobody pays for them.',
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
    id: 'picked-off',
    term: 'Taken off you (mark-out)',
    short: 'A resting quote of yours that a named rival hit, and how far the price ran against it a second later.',
    long:
      'A quote that rests in the book can be hit by anyone faster who knows the price has moved. When a rival ' +
      'takes it, the game counts it, and a second later reads the mid: if you sold and the mid is now higher, or ' +
      'bought and it is lower, the quote was worth that much to the rival and cost you the same. That is the ' +
      'mark-out. A lost race is a different thing: the order that arrived first fills and yours finds it gone, ' +
      'and no honest money figure belongs to it, so it is counted and timed, not priced. The crowd is not a ' +
      'rival and is never named. The remedies are the same as for adverse selection: speed, fresher data, ' +
      'stepping away on news.',
  },
  {
    id: 'rent',
    term: 'Rent: a fixed cost',
    short: 'What the office, line and computer in use cost each week, whether the firm earned or not.',
    long:
      'A fee is paid when a trade happens; rent is paid because the seat exists. At Friday’s close the firm is charged ' +
      'a week’s rent on every office, line and computer it has in use, and so is every rival, and it counts in that ' +
      'day’s result. The full week is charged whenever in the week the seat was bought. This is why a fast seat has to ' +
      'earn its keep: a colocated rack that trades a little loses money every week it sits there. Real firms pay for ' +
      'racks, cross-connects and market data by the month, and the faster the seat the larger the bill. The home ' +
      'office, the consumer line and the laptop are free, so the cheapest way to lose is to buy speed you do not use.',
  },
  {
    id: 'day-cause',
    term: 'Why a day made or lost money',
    short: 'The one thing that most of a day’s result came from: a charge, a block or a stock.',
    long:
      'A day’s P&L is the sum of many things, and the one that moved it most is the place to look first. The ' +
      'candidates are the fees the exchanges charge on every fill, the fines the regulator adds, the rollover on ' +
      'currencies and the storage and lease on metal held at 17:00, the worst or best block, and the worst or best ' +
      'stock. The game names the biggest, with its figure. It is a pointer, not a diagnosis: a block that lost the ' +
      'most may only have traded the most, so read its record over several days before changing it.',
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
    id: 'concentration',
    term: 'Concentration',
    short: 'Most of the result coming from one stock, or one trade.',
    long:
      'A firm that earns nearly all of its money from one name has one bet, however many trades it made. ' +
      'It may be a real edge on that stock, or a run of luck, or the story of one company on one week. ' +
      'Spread over more names the same method either holds or does not, and that is the test.',
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
    id: 'backtest',
    term: 'Backtest',
    short: 'Running a changed strategy over a day that has happened, to see what it would have done.',
    long:
      'Before betting the firm on a change, a desk runs it over the past and compares it with what it ' +
      'already does. Here the game re-runs short windows of the day that just closed, once as you were and ' +
      'once with the change, from the same starting moment. The market is the same market: the same fair ' +
      'values and the same headlines. But the crowd answers each firm’s orders, so the books of the changed ' +
      'run differ from the day that was, and a backtest is never quite the history. It is evidence, not a ' +
      'promise.',
  },
  {
    id: 'sample',
    term: 'Sample',
    short: 'The part of the past a result rests on. A small one proves little.',
    long:
      'Three windows of five minutes are a sliver of a day, and a day is a sliver of a market. A change that ' +
      'wins in all three might be better, or might have met three kind moments. A change that wins in one and ' +
      'loses in another has told you very little. That is why the table says “mixed” so often, and why a ' +
      'record over several nights counts for more than any one of them.',
  },
  {
    id: 'overfitting',
    term: 'Overfitting',
    short: 'A change that wins the windows it was tried on, because it suits them and not the market.',
    long:
      'Try enough variations on the same few windows and one will win by luck. If you then keep it because it ' +
      'won, you have fitted your strategy to those windows, and it will lose its edge on the next day. The ' +
      'defence is the dull one: ask for a win in every window, ask for it again on another night, and prefer a ' +
      'change you can explain to one that only happens to score.',
  },
  {
    id: 'payback',
    term: 'Payback',
    short: 'How many days of the extra profit it takes to earn back what an upgrade cost.',
    long:
      'An upgrade has a price now and a gain every day after. The payback is the price over the gain a day. ' +
      'Here the gain is measured in a few minutes of the day and scaled up to a whole session, which assumes ' +
      'the rest of the day is like those minutes. It rarely is, so read it as an order of magnitude: a payback ' +
      'of days is worth a look, and a payback of years is not.',
  },
  {
    id: 'attribution',
    term: 'Attribution',
    short: 'Saying which block, stock or trade earned what.',
    long:
      'A firm’s profit is one number, and one number cannot tell you what to change. Attribution splits it: ' +
      'by block, by stock, by race. A block that bleeds under a profitable firm is carried by the others, and ' +
      'the total hides it. The overview’s block lines and the day reports are attribution; every signal starts ' +
      'from one.',
  },
  {
    id: 'regime-dependence',
    term: 'Regime dependence',
    short: 'A block whose result changes sign with the kind of day.',
    long:
      'Look at a block’s average day for each kind of day. If it earns on calm days and loses on trending ' +
      'ones, its overall average is a mixture, and it will look good or bad according to the weather of the ' +
      'days you happened to have. The table on the overview shows each block by kind of day, with how many ' +
      'days each average rests on: a few days is a hint. See Market regimes for the kinds of day.',
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
  {
    id: 'future',
    term: 'Future',
    short: 'A contract to buy or sell something later at a price agreed now, held on margin.',
    long:
      'A future on the index is a promise to settle at the index’s price on a set day, the expiry. Nobody pays ' +
      'the price up front: each side posts margin, a slice of it, and the gains and losses change hands in cash ' +
      'every night. So one contract carries far more market than the cash it ties up. Here a contract is a ' +
      'hundred times the index, about five thousand dollars of it, and it trades on the Prairie Board.',
  },
  {
    id: 'basis',
    term: 'Basis',
    short: 'How far a future’s price is from what it is on.',
    long:
      'A future on the index is not the index: buying the future instead of the stocks saves the interest on the ' +
      'money and gives up their dividends until expiry. So it is priced at the index carried forward, a few cents ' +
      'over it here, more the further out it expires, and nothing on the day it expires. When the basis is not ' +
      'what carry says, one of them is wrong, and basis arbitrage sells the dear one and buys the cheap.',
  },
  {
    id: 'carry',
    term: 'Carry',
    short: 'What it costs, or earns, to hold something until a later day.',
    long:
      'Holding the index for a week costs the interest on what you paid and earns its dividends. The difference, ' +
      'a share a year, is the carry: here 3.5%, so a contract a week out is about 3.5 cents over the index and one ' +
      'two weeks out about 7. Carry is why the next contract is always dearer than the near, and why rolling from ' +
      'one to the other is never quite free. A currency has carry too: holding one earns its interest rate and ' +
      'owing the other costs its own, paid each night as rollover. Here the dollar pays 4.5% and the yen 0.5%, so ' +
      'long the dollar against the yen is paid to wait. The carry trade is holding that position for the nights, ' +
      'and the risk is that the rate moves more in an hour than the nights pay in a month. A metal carries the ' +
      'dollar’s rate and its storage less its lease rate, and that can turn below nothing.',
  },
  {
    id: 'margin',
    term: 'Margin',
    short: 'The money posted against a position held on credit: initial to open it, maintenance to keep it.',
    long:
      'A future is not bought outright. The venue asks for a share of its value as a deposit, the initial margin ' +
      '(8% here), before you may open it, and a smaller share, the maintenance margin (6%), to keep it. Your ' +
      'equity is what stands behind it: an order that would need more initial margin than your equity is refused. ' +
      'Margin is leverage you may not notice: a few hundred dollars holds five thousand dollars of index.',
  },
  {
    id: 'variation-margin',
    term: 'Variation margin',
    short: 'A future’s gain or loss paid in cash every night, not at the end.',
    long:
      'At each close the venue marks every future to its settlement price, and the move since yesterday changes ' +
      'hands: losers pay, winners are paid, and the price becomes the position’s new cost. So a losing future ' +
      'is not a paper loss waiting for a better day; it is cash gone tonight, and a firm short of cash meets the ' +
      'margin call however right it turns out to be.',
  },
  {
    id: 'margin-call',
    term: 'Margin call',
    short: 'Below the maintenance margin, the position is closed for you.',
    long:
      'When your equity falls below the maintenance margin your futures ask for, the firm is flattened in them at ' +
      'whatever price there is, in the middle of the move that put it there. The stocks may carry on; the futures ' +
      'are gone. A margin call is a loss locked in by being too big for your cash, not by being wrong.',
  },
  {
    id: 'expiry',
    term: 'Expiry',
    short: 'The day a contract ends and settles.',
    long:
      'Each future ends on a set day: here every Friday at the stocks’ close. Whoever still holds it is settled ' +
      'in cash at the index’s price and is out; a contract on a metal may instead be delivered, the metal itself ' +
      'paid for. As expiry nears the basis goes to nought and the trading thins. A new contract is listed as one ' +
      'ends, so there are always two: the near and the next.',
  },
  {
    id: 'roll',
    term: 'Roll',
    short: 'Moving a futures position from the contract about to expire to the next.',
    long:
      'To hold the index through futures for longer than a week, sell the near contract before it expires and buy ' +
      'the next. It crosses two spreads and pays the difference in carry, since the next is dearer. Roll early and ' +
      'you pay for a longer carry; roll late and you trade in the thin last hours or are settled out.',
  },
  {
    id: 'lead-lag',
    term: 'Lead-lag',
    short: 'One market moves first and another follows: trading the follower on what the leader did.',
    long:
      'The future on the index trades where the crowd catches up with a move in tens of milliseconds; the stocks ' +
      'trade where it takes hundreds. After the market moves, the future has repriced and the index has not. A ' +
      'firm that sees the future soon enough knows where the index is going before its crowd does. The edge is ' +
      'the time between them, so it is bought with a rack at the futures venue and the fastest line to the stocks.',
  },
  {
    id: 'currency-pair',
    term: 'Currency pair',
    short: 'One currency priced in another: EUR/USD is the euro in dollars.',
    long:
      'A currency has no price of its own, only a price in another. EUR/USD at 1.0850 says a euro costs a dollar ' +
      'and eight and a half cents; USD/JPY at 150.00 says a dollar costs a hundred and fifty yen. Buying a pair ' +
      'buys the first currency and pays with the second, so a position in it is two balances, one up and one ' +
      'down. Here there are two pairs that move with the dollar, in opposite directions, and the cross between ' +
      'them, all traded in Eastholm, east of the stocks.',
  },
  {
    id: 'base-quote',
    term: 'Base and quote currency',
    short: 'The first currency of a pair is what you buy; the second is what its price is counted in.',
    long:
      'In EUR/USD the euro is the base and the dollar the quote: the price is dollars for one euro. Buy a lot and ' +
      'your euro balance goes up by a thousand euros and your dollars down by the price. In USD/JPY the dollar is ' +
      'the base, so buying it spends yen. What a position makes or loses is counted in the quote currency first, ' +
      'yen for the yen pairs, and the game turns it into dollars at the rate now.',
  },
  {
    id: 'pip',
    term: 'Pip',
    short: 'The smallest step a currency price usually moves: 0.0001 for the euro in dollars, 0.01 for the yen.',
    long:
      'A pair is quoted to more places than a stock because its moves are small: EUR/USD moves about half a ' +
      'percent on a day, some fifty pips. A pip is the fourth place, 0.0001 of a dollar, for most pairs, and the ' +
      'second, 0.01 of a yen, for the yen pairs, since a yen is worth so little. Here a price point is a pip: ' +
      'a spread of one pip on a lot of EUR/USD is ten cents.',
  },
  {
    id: 'lot',
    term: 'Lot',
    short: 'The unit a currency trades in: here a thousand of the base currency.',
    long:
      'Nobody trades one euro. Currencies trade in lots, and a lot here is a thousand of the first currency of ' +
      'the pair: a thousand euros, or a thousand dollars against the yen. A pip on a lot is ten cents for ' +
      'EUR/USD and ten yen for the yen pairs, about seven cents. The real market’s standard lot is a hundred ' +
      'times that; the game keeps the sums small enough to read.',
  },
  {
    id: 'cross-rate',
    term: 'Cross rate',
    short: 'A pair worked out from two others through a third currency: EUR/JPY from EUR/USD and USD/JPY.',
    long:
      'If a euro is 1.0850 dollars and a dollar is 150.00 yen, a euro must be 162.75 yen: the euro in yen is the ' +
      'product of the other two. EUR/JPY trades on its own book, with its own crowd, but its fair value is that ' +
      'product and nothing else. Here its crowd is slower than the two pairs’, so when the dollar moves the cross ' +
      'is left behind for a moment.',
  },
  {
    id: 'triangular-arbitrage',
    term: 'Triangular arbitrage',
    short: 'Trading a cross against its two legs when they disagree, three orders at once.',
    long:
      'When EUR/JPY is dearer than EUR/USD times USD/JPY, sell the cross and buy the two legs; when it is cheaper, ' +
      'the other way. Done in full, the euros, dollars and yen bought and sold cancel and what is left is the gap, ' +
      'less three fees and three spreads. It is three races, not one: lose one leg and the firm holds a currency ' +
      'it did not mean to, and must trade it back at whatever the price has become. The gap lasts milliseconds, ' +
      'so it belongs to whoever is nearest.',
  },
  {
    id: 'dealer',
    term: 'Dealer',
    short: 'A bank that quotes its own prices to trade with, instead of a book of everyone’s orders.',
    long:
      'Much of the currency market is not an exchange: a dealer shows a bid and an ask and trades with you itself. ' +
      'Here the Ashford Bank dealing desk charges no fee, since its spread is its fee, and it takes a look at ' +
      'each order before it fills it. Its price moves with the market like a book’s, but it does not have to ' +
      'keep its word.',
  },
  {
    id: 'last-look',
    term: 'Last look',
    short: 'A dealer’s right to see your order and refuse it if the price has moved against it since.',
    long:
      'The dealer holds an order that would take its price for a few milliseconds, 5 here, then fills it only if ' +
      'its own idea of the price has not moved more than half a pip past the order. If it has, the order comes ' +
      'back refused. So a dealer can quote tight, because it is never picked off by a faster firm: it is a market ' +
      'maker’s free option, seen from the other side. A firm that trades on news the dealer has not heard is the ' +
      'one refused most.',
  },
  {
    id: 'rollover',
    term: 'Rollover',
    short: 'The nightly interest on a currency position: earned on the one held, paid on the one owed.',
    long:
      'A currency position is moved on to the next day at 17:00 each weekday. It earns a day of the interest rate ' +
      'of the currency it holds and pays a day of the rate of the one it owes, on a year of 360 days, less half a ' +
      'percent a year the venue keeps either way. Wednesday pays three days, for the weekend. Here the dollar pays ' +
      '4.5%, the euro 3% and the yen 0.5%: a night on a lot is a few cents, and it is paid into the currency the ' +
      'pair is priced in.',
  },
  {
    id: 'home-currency',
    term: 'Home currency',
    short: 'The currency the firm counts in: the dollar. Every other balance is turned into it at the rate now.',
    long:
      'The firm’s cash is in dollars and its results are in dollars. A balance in euros or yen is still money, ' +
      'but what it is worth moves with the rate: hold a hundred thousand yen and do nothing, and its dollar value ' +
      'goes up and down all day. The equity, the loss limit and the exposure cap all count the balances in ' +
      'dollars at the mid of the pair that prices them, so a currency held is a position, traded or not.',
  },
  {
    id: 'spot',
    term: 'Spot',
    short: 'The metal itself, bought or sold for now, as against a future on it for later.',
    long:
      'Spot gold is gold you hold from the moment it fills: here a lot is ten ounces, priced in dollars an ounce ' +
      'to ten cents. It trades in Port Sundar by night and in Thamesford by day; in the afternoon, when both are ' +
      'shut, only the futures in Hudson trade, and spot has no market. Metal held long pays storage every night, ' +
      'and metal sold short pays the lease, because it was borrowed to sell.',
  },
  {
    id: 'futures-curve',
    term: 'Futures curve',
    short: 'Spot and each future’s price set against their dates: the market’s price of waiting.',
    long:
      'Line up the price of the metal now and of each contract by the day it expires, and the line they make is ' +
      'the curve. Its slope is the carry: what it costs to buy the metal today and hold it until then, the ' +
      'interest on the money and the storage, less what lending it out would earn. Here there are three weekly ' +
      'contracts, so the curve has four points. A calendar spread trades one point of it against another when ' +
      'the gap between them is not what the carry says.',
  },
  {
    id: 'contango',
    term: 'Contango',
    short: 'A curve that rises: the later the date, the dearer the metal.',
    long:
      'Holding metal costs money: the interest on what it cost and its storage. So a contract for later is ' +
      'normally dearer than the metal now, by about what holding it would cost until then. That rising curve is ' +
      'contango. Here the dollar’s 4.5% and storage’s 0.5% a year outweigh the lease most of the time, so a week ' +
      'out is a couple of dollars an ounce over spot.',
  },
  {
    id: 'backwardation',
    term: 'Backwardation',
    short: 'A curve that falls: the metal now is dearer than the metal later.',
    long:
      'When metal is short now, whoever has it can lend it out at a high lease rate, and that pays more than the ' +
      'interest and storage it costs to hold. The carry turns below nothing and later contracts are cheaper than ' +
      'spot. A supply headline (a strike, a refinery fire) can do it in a minute: the lease jumps, and the curve ' +
      'flips from contango to backwardation until the lease decays back.',
  },
  {
    id: 'lease-rate',
    term: 'Lease rate',
    short: 'What borrowing the metal costs a year, and what lending it earns.',
    long:
      'A holder of gold can lend it out and be paid a rate for it, as cash earns interest. That rate comes off the ' +
      'carry: a future is priced at spot carried by the dollar’s rate and storage, less the lease. Here gold’s ' +
      'lease starts near 0.3% and silver’s near 0.8%, each wandering, and a supply headline lifts it by several ' +
      'points before it decays over a day or two. Metal held short pays the lease each night.',
  },
  {
    id: 'storage',
    term: 'Storage',
    short: 'What it costs a night to keep metal held long in a vault.',
    long:
      'Bullion has to sit somewhere guarded and insured. Here storage is 0.5% of its value a year, more than the ' +
      'real figure so that a night of it shows, charged at 17:00 each weekday on spot metal held long, three ' +
      'nights on Friday for the weekend and none on Saturday or Sunday. A short pays the lease instead. Both are ' +
      'written into that day’s report and its P&L. A future costs no storage: its price carries it instead.',
  },
  {
    id: 'delivery',
    term: 'Delivery',
    short: 'A contract held to expiry that ends as the thing itself, not as cash.',
    long:
      'An index future ends in cash. A metal future is delivered: whoever holds one long at expiry is paid the ' +
      'metal, a lot of spot for each contract, and pays its price in cash; a short delivers it and is left short ' +
      'spot. The trap is what comes after. Delivered metal is spot, so it pays storage from that night, and a ' +
      'delivered short pays the lease, until it is sold or bought back on a spot venue. Rolling to the next ' +
      'contract before expiry is how a trader keeps the exposure without the metal.',
  },
  {
    id: 'fix',
    term: 'The fix',
    short: 'A daily price set by an auction at a fixed time, which many contracts are written against.',
    long:
      'Twice a weekday, at 05:30 and 10:00, the Thamesford Bullion Market stops trading gold and silver ' +
      'continuously and runs a call auction. Everyone rests their orders for thirty seconds, the venue shows the ' +
      'price it would uncross at, and at the time every crossing order fills at that one price. That price is ' +
      'the fix. A large order rested into a fix pays no spread, but it is in the one price: a big buy lifts the fix it buys at. ' +
      'If nothing crosses, there is no fix that time.',
  },
  {
    id: 'fix-flow',
    term: 'Orders at the fix',
    short: 'Clients’ orders sent to be filled at the fix’s price, late and often more on one side.',
    long:
      'A fund that must buy gold at the day’s fix, a jeweller settling a contract written against it, a bank ' +
      'squaring its book: they want the fix’s price, whatever it is, and send their orders into the call, many in ' +
      'its last moments. When more of them buy than sell, the uncrossing price climbs above what the metal is ' +
      'worth, and the other way when they sell. A firm that sees the indicative jump in time rests the other side ' +
      'and is paid for it once the book is back by the future after the fix. Here they land in the last 150 ms of ' +
      'the call, so only a firm beside Thamesford, or near it, sees them in time; silver’s fix moves most.',
  },
  {
    id: 'call-auction',
    term: 'Call auction',
    short: 'A spell when orders only rest, then all cross at once at one price.',
    long:
      'In a call, an order that would trade does not: it rests, and a taker’s immediate-or-cancel order is refused ' +
      'outright. The crowd rests too. Each moment the venue publishes an indicative: the price it would uncross at ' +
      'now and how much would trade. A firm sees it as late as its quotes, so a firm nearer the venue sees it ' +
      'move sooner. At the end, everything that crosses fills at the uncrossing price. The Lab’s batch auction ' +
      'holds the firms but not the crowd; a call holds everyone.',
  },
  {
    id: 'uncrossing-price',
    term: 'Uncrossing price',
    short: 'The one price an auction fills everything at: where the most trades.',
    long:
      'When a call ends, the bids above the asks have to be matched at a single price. The venue picks the one ' +
      'that trades the most volume; if two tie, the one leaving least unfilled; then the one nearest what the ' +
      'crowd believes. Every fill is at that price, the best bids and the lowest asks first, the oldest first ' +
      'among equals. A buyer who bid far above it still pays only it.',
  },
  {
    id: 'gold-silver-ratio',
    term: 'Gold-silver ratio',
    short: 'How many ounces of silver an ounce of gold buys.',
    long:
      'Gold near $2,400 and silver near $30 make the ratio about 80. The two move together, silver about twice as ' +
      'far in a day, so the ratio wanders around where it has been. Pairs across desks can trade it: when gold is ' +
      'dear against silver by more than its band, sell gold and buy the same value of silver, and wait for the ' +
      'ratio to come back. When it does not, that is a loss on both legs.',
  },
  {
    id: 'miner',
    term: 'Miner',
    short: 'A company that digs the metal up: a stock that moves with the metal, and with the stocks.',
    long:
      'Ridgeline Mining trades on the stock exchanges like any stock, but what it digs up is gold, so its price ' +
      'and gold’s move together: here gold reads the miners’ factor of the stocks. The two are not the same ' +
      'thing, though. The miner has its own news and its own costs, and it moves with the stock market too, so ' +
      'the gap between them opens and closes. Pairs across desks trades the miner against the metal on that gap.',
  },
  {
    id: 'economic-calendar',
    term: 'Economic calendar',
    short: 'The times of the day’s market-wide releases, published each morning. Not what they say.',
    long:
      'Rate decisions, inflation prints and the like are scheduled, and everyone knows the time. The game lists the ' +
      'day’s market-wide headlines by time as a market release, never what they say: not what the figure is, not ' +
      'which way the market will take it, not how far. A company’s or a sector’s headline is not on the calendar; ' +
      'those arrive without warning. Knowing when is worth something, because traders and prices behave differently ' +
      'around a release: they wait, then move. Watch mode slows down for one.',
  },
  {
    id: 'fast-forward',
    term: 'Fast-forward',
    short:
      'At the top speed the quiet is skipped in half-second steps with every firm’s blocks asleep; trading happens around the moments and after headlines.',
    long:
      'At 300× the game would spend most of its time simulating seconds in which nothing happens, two milliseconds at a time. ' +
      'So through the quiet it simulates half a second at a time, about twenty times cheaper, and says “fast-forward” on the bar. ' +
      'In those stretches every firm’s blocks are asleep, yours and the rivals’: they decide nothing and send nothing, ' +
      'and whatever they had resting is pulled and returned to them. The crowd, the prices, the news, the margin checks, the ' +
      'rollover and the settlements go on, and what you hold is held and marked as ever. Around the open, the close, a fix ' +
      '(its whole call), an expiry and a market release, for ten seconds after any headline, and for ten seconds after you click, ' +
      'switch a block on or change a parameter, the game is simulated every 2 milliseconds, the blocks wake and trade, and the bar says “live”. ' +
      'To trade through the quiet, play at 60× or slower. The same seed played at different speeds is a different game; ' +
      'the experiments and the night’s tests are always simulated exactly, with the blocks awake.',
  },
  {
    id: 'watch-mode',
    term: 'Watch mode',
    short: 'A speed that runs fast through the quiet and slows to 1× around the moments worth seeing.',
    long:
      'Pick watch and the game runs at the top speed while little is happening, then drops to real time five ' +
      'seconds before a time everyone can see coming (the open, the close, a fix, a contract’s expiry, a market release on the economic calendar) and ' +
      'stays there for ten seconds after it. It also drops to real time for ten seconds after a headline lands. ' +
      'It never slows before an unannounced headline: a company’s or a sector’s news is not something the market ' +
      'tells you ahead of time, so watch cannot either. The line beside the speeds says what is next, and what is being watched while it is slow.',
  },
  {
    id: 'option',
    term: 'Option',
    short: 'The right, not the duty, to buy or sell the index at a set price by a set time.',
    long:
      'An option is a contract you pay for. A call gives the right to buy the index at the strike; a put the right ' +
      'to sell it there. You pay the premium at once and, if the index ends where the right is worth using, you are ' +
      'paid the difference at the expiry; if it does not, the premium is gone and that is all you can lose. The ' +
      'seller has it the other way: keeps the premium, and owes whatever the buyer is owed. Here an option is on the ' +
      'index, a hundred times its price, and expires the same day or the next at the stocks’ 16:00 close. It is ' +
      'insurance when you hold it against something else, and a bet on a move when you do not.',
  },
  {
    id: 'call',
    term: 'Call',
    short: 'An option to buy the index at the strike. It gains as the index rises.',
    long:
      'A call is worth something at the expiry if the index is above its strike: the difference, times a hundred. ' +
      'Below the strike it is worth nothing. Before then its price is that, if there were no time left, plus what ' +
      'the time still might add. Its delta is between nought and one: it rises with the index, a fraction of the ' +
      'way. A call at the money is as likely to end worth something as not.',
  },
  {
    id: 'put',
    term: 'Put',
    short: 'An option to sell the index at the strike. It gains as the index falls.',
    long:
      'A put is worth something at the expiry if the index is below its strike: the difference, times a hundred. ' +
      'Above the strike it is worth nothing. It is the insurance: hold the index and a put under it, and a fall in ' +
      'the index is paid for by the put, at the cost of the premium. Its delta is between minus one and nought: it ' +
      'rises as the index falls. Puts usually cost more volatility than calls (the skew), because people pay for ' +
      'protection.',
  },
  {
    id: 'strike',
    term: 'Strike',
    short: 'The price an option lets you buy or sell the index at.',
    long:
      'Each option has one strike, fixed when it is listed and kept for its life. The chain lists three on each ' +
      'expiry, a dollar apart: one at the index when the expiry was listed, one a dollar below and one a dollar ' +
      'above. If the index moves a long way in the day the chain does not follow it, so the middle strike may end ' +
      'up well off the money and the far ones very far. The strike sets whether an option is in or out of the money.',
  },
  {
    id: 'premium',
    term: 'Premium',
    short: 'The price of an option: what the buyer pays and the seller keeps.',
    long:
      'The premium is paid when the option is bought, in full, and kept by the seller whatever happens after. It is ' +
      'quoted in the index’s points for one unit, and a contract is a hundred of them: a premium of 0.34 is $34 a ' +
      'contract. It is made of the intrinsic value plus the time value. A straddle’s premium (a call and a put at the ' +
      'same strike) is, to a rough measure, the move the market expects, because the buyer is paid back only if the ' +
      'index moves at least that far.',
  },
  {
    id: 'in-the-money',
    term: 'In the money',
    short: 'An option that would pay something if it expired now.',
    long:
      'A call is in the money when the index is above its strike, a put when the index is below it. At the expiry an ' +
      'option in the money is settled in cash for how far in it is; the long receives it and the short pays it. ' +
      'Before then an option in the money is worth at least that, plus time value. It has a large delta, near one ' +
      'for a call deep in the money, so it moves almost one for one with the index.',
  },
  {
    id: 'out-of-the-money',
    term: 'Out of the money',
    short: 'An option that would pay nothing if it expired now.',
    long:
      'A call is out of the money when the index is below its strike, a put when it is above. At the expiry it ' +
      'expires worthless: nothing is paid, and the buyer has lost the whole premium. Before then it is worth only ' +
      'its time value, the chance that the index gets there. The further out it is, the cheaper, the smaller its ' +
      'delta, and the more it depends on the volatility being what the market says. An option at the strike is ' +
      'at the money, and also pays nothing if it ends exactly there.',
  },
  {
    id: 'intrinsic-value',
    term: 'Intrinsic value',
    short: 'What an option would pay if it expired now: how far in the money, or nothing.',
    long:
      'For a call it is the index less the strike, for a put the strike less the index, and never below nought. It ' +
      'is the floor under the premium: nobody sells an option for less than it would pay at once. At the expiry ' +
      'the premium is the intrinsic value and nothing else, and that is the amount settled in cash. An option out ' +
      'of the money has none; the premium it still has is all time value.',
  },
  {
    id: 'time-value',
    term: 'Time value',
    short: 'What an option is worth over its intrinsic value: the chance of more before it expires.',
    long:
      'While an option has time to go the index might yet move in its favour, and that chance has a price. It is ' +
      'largest at the money and with the most time and the most volatility, and it all wastes away by the expiry: ' +
      'that wasting is theta. A buyer pays for it and watches it leak a little every minute; a seller collects it ' +
      'and is paid for taking the risk that the index moves enough to cost more than it brought in.',
  },
  {
    id: 'implied-volatility',
    term: 'Implied volatility',
    short: 'The volatility that makes the model give the option’s price: how much move the price expects.',
    long:
      'A model prices an option from the index, the strike, the time left and a volatility. Turn it around: take the ' +
      'price on the book and find the volatility that gives it. That is the implied volatility, an annual figure in ' +
      'per cent, and it is what the market expects the index to move, whatever it later does. The chain shows it ' +
      'for each option, worked out here by bisection from the middle of the bid and the ask, and quoted on trading ' +
      'time (the session’s hours, as the realised figure is), so the two can be set side by side. Options with the same ' +
      'expiry but different strikes differ in it: that is the skew.',
  },
  {
    id: 'realised-volatility',
    term: 'Realised volatility',
    short: 'How much the index has actually been moving, as an annual figure.',
    long:
      'Implied volatility is a forecast; realised volatility is what has happened. The game reads it from the ' +
      'index’s moves each second in the stocks’ hours, weights the recent half-hour most, and quotes it on a ' +
      'trading year so that it can be set beside the implied figure. A quiet morning has a low one and a day of ' +
      'news a high one. The option market prices the future from it, plus a premium, and then the day proves it ' +
      'right or wrong.',
  },
  {
    id: 'volatility-premium',
    term: 'Volatility premium',
    short: 'How far the implied volatility sits above the realised: what sellers of options are paid for.',
    long:
      'Options are usually priced for a little more movement than there then is, because the seller is taking a ' +
      'risk that the buyer is paying to avoid. Here the at-the-money volatility is set about fifteen per cent over ' +
      'the realised figure, plus what the releases still to come add. A market maker who sells options earns that ' +
      'on a quiet day and gives it back, and more, on a trending or news day, when the index moves further than ' +
      'the price said. Whether it pays is the question the hedged maker answers.',
  },
  {
    id: 'skew',
    term: 'Skew',
    short: 'Options at different strikes have different implied volatilities: puts cost more than calls.',
    long:
      'If every strike had one volatility the chain would be smooth. It is not: here the volatility rises by a tenth ' +
      'of itself for each one per cent a strike is below the index, so a put below the money costs a higher ' +
      'volatility than a call above it. In the real market the same tilt comes from the demand for protection ' +
      'against a fall. Read across a row of the chain: the implied volatility at the low strike is above the one at ' +
      'the high strike. It is fixed here, not fitted to the crowd.',
  },
  {
    id: 'delta',
    term: 'Delta',
    short: 'How much an option’s price moves for a move of one in the index.',
    long:
      'A call’s delta is between nought and one, a put’s between minus one and nought. A delta of 0.5 means the ' +
      'option gains about half a cent for every cent the index gains. A contract is a hundred units, so ten calls at ' +
      '0.5 act like 500 units of the index, which is five contracts of its future. Delta changes as the index moves ' +
      '(that is gamma) and as time passes. The desk’s delta in Position is the sum over everything held, and is ' +
      'what a hedge in the future cancels.',
  },
  {
    id: 'gamma',
    term: 'Gamma',
    short: 'How fast delta changes as the index moves. A seller pays for it on a trending day.',
    long:
      'Gamma is the change in delta for a move in the index, and it is largest at the money close to the expiry. ' +
      'A buyer is long gamma: as the index rises the delta rises, as it falls the delta falls, so the position gains ' +
      'either way, more than the delta alone says. A seller is short gamma and the reverse: chasing the index, ' +
      'buying what has risen and selling what has fallen. That is why a trending day hurts the maker, and why the ' +
      'what-if under the greeks shows a loss for a short straddle whichever way the index goes.',
  },
  {
    id: 'theta',
    term: 'Theta',
    short: 'How much an option’s price falls with a day passing. The buyer pays it, the seller earns it.',
    long:
      'Time value wastes away, and theta is how fast: the cents an option loses to a calendar day passing, the other ' +
      'things the same. It is largest at the money and on the last day, when a whole day is most of what is left. ' +
      'The desk’s figure in Position is a day’s worth, negative for a buyer and positive for a seller. It is the ' +
      'trade the other greeks pay for: a seller earns theta every day and pays it back in gamma on a day the index ' +
      'moves.',
  },
  {
    id: 'vega',
    term: 'Vega',
    short: 'How much an option’s price moves for a point of volatility.',
    long:
      'A buyer is long vega: if the implied volatility rises by a point the option is worth more, and by the ' +
      'same amount less if it falls. Vega is largest at the money and with more time to go. The desk’s figure in ' +
      'Position is what a point of volatility is worth in cents; the what-if moves it by five. A release ahead ' +
      'holds the implied volatility up and, when it lands, takes it away: the crush.',
  },
  {
    id: 'delta-hedge',
    term: 'Delta hedge',
    short: 'Trading the index’s future to cancel the delta of the options held.',
    long:
      'A maker who sells options is left with a bet on the index. The delta says how big: if the desk is long 500 ' +
      'units, sell five contracts of the future (a hundred units each) and the sum is nought. The bet on direction ' +
      'is gone; what is left is gamma, theta and vega, the bets on how much the index moves and how fast. The ' +
      'hedge has to be done again as the delta changes, and each trade pays a fee. Position says how many futures ' +
      'would flatten the desk; the option maker block does it for you.',
  },
  {
    id: 'put-call-parity',
    term: 'Put-call parity',
    short: 'A call less a put at one strike equals the future less the strike: if not, there is a free trade.',
    long:
      'Buy a call and sell a put at the same strike and expiry and you hold what a future bought at the strike would ' +
      'give: the same payoff whatever the index does. So call less put must equal the future’s price less the ' +
      'strike, discounted for the time. When the books are a little out of line, the three can be traded against ' +
      'each other for the gap, less the fees on every leg. The books here are one model’s, so the gap is rarely ' +
      'wide enough to pay; the parity block waits for the one that is.',
  },
  {
    id: 'conversion',
    term: 'Conversion',
    short: 'Buy the future, buy a put and sell a call at one strike: the parity trade when the future is cheap.',
    long:
      'A conversion turns a call into a future and a put: sell the call, buy the put, buy the future. At expiry ' +
      'the three net to the strike whatever the index did, so if they cost less than that, the difference is ' +
      'locked in. The reverse, selling the future and the put and buying the call, is a reversal, for when the ' +
      'future is dear. Both depend on all three legs filling: a missed leg leaves a position, which the block ' +
      'scratches by closing the rest.',
  },
  {
    id: 'the-crush',
    term: 'The crush',
    short: 'Implied volatility falls away once a known release has landed.',
    long:
      'Before a scheduled release the market cannot know which way the index will jump, only that it may, so the ' +
      'implied volatility of every option that expires after it carries the release’s share. When the headline ' +
      'lands that uncertainty is gone and the share goes with it, at once: the implied volatility drops, and with ' +
      'it the option’s price, whether the index moves or not. A buyer of a straddle into a release needs the ' +
      'move to be bigger than the crush. The economic calendar says when; it never says which way.',
  },
  {
    id: 'cash-settlement',
    term: 'Cash settlement',
    short: 'At expiry the option pays its intrinsic value in cash, and nothing is delivered.',
    long:
      'Nobody takes or gives the index. At the 16:00 close an option in the money is settled for its intrinsic ' +
      'value, how far in the money it is, times a hundred: the long receives it and the short pays it, and out of the money, or exactly ' +
      'at the strike, nothing is paid. The premium was paid when the option was traded, so what the option made ' +
      'is the settlement less what it cost. An option held through the close by a firm whose block is off still ' +
      'settles. The day’s report lists each one.',
  },
];

export function glossary(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.id === id);
}
