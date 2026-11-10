// The Overview: the firm read over time. Position, the day so far, trends over the days kept, signals, and the
// comparisons from the night's tests. Every section says in a line how to read it and keeps a fuller note folded
// behind it. All numbers are worked out in overview.ts and the store; this file arranges and words them.

import { useSyncExternalStore } from 'react';
import { REGIMES, RENT_WORDS, shows, signals as readSignals, type Signal, type StageId } from '../content';
import { calendar, MARKET_CLOSE, MARKET_OPEN, MS_PER_MINUTE, type Snapshot } from '../sim';
import { Comparisons } from './Comparisons';
import { balance, money, moneyShort, ms } from './format';
import { Term } from './Glossary';
import { Section } from './OverviewSection';
import { Legend, LineChart, PnlChart, lineStyle, type Line } from './OverviewCharts';
import { Targets } from './Targets';
import type { Met, Store } from './store';
import {
  blockDays,
  blockName,
  blockShown,
  comingLine,
  compare,
  dayCause,
  dayVerdict,
  feeShares,
  latestWithRuns,
  nearest,
  overviewShown,
  raceShares,
  regimeTable,
  setupLine,
  shownBalances,
  weekPnl,
} from './overview';

const signedMoney = (cents: number) => money(Math.round(cents), true);
const axisMoney = (v: number) => moneyShort(v, true);
const axisPct = (v: number) => `${Math.round(100 * v)}%`;
const upDown = (cents: number) => (cents > 0 ? 'up' : cents < 0 ? 'down' : '');

export function OverviewPanel({ s, store }: { s: Snapshot; store: Store }) {
  const stage = useSyncExternalStore(store.subscribe, store.getStage, store.getStage);
  const tests = useSyncExternalStore(store.subscribe, store.getTests, store.getTests);
  const met = useSyncExternalStore(store.subscribe, store.getTargets, store.getTargets);
  const sigs = readSignals(s.days, s, { shown: (f) => shows(f, stage) });
  // Position and Today from the first minute; the rest as the game has something to put in them. A section that
  // appears is appended below what is there, so nothing already on the page moves.
  const shown = overviewShown(s.days, tests.nights, sigs.length);
  const coming = comingLine(shown);
  return (
    <main className="layout single overview">
      <Position s={s} met={met} stage={stage} />
      <Today s={s} stage={stage} />
      {coming && <p className="ov-coming muted small">{coming}</p>}
      {shown.trends && <Trends s={s} stage={stage} />}
      {shown.signals && <SignalsSection sigs={sigs} tests={tests} />}
      {shown.comparisons && <Comparisons s={s} store={store} tests={tests} stage={stage} sigs={sigs} />}
    </main>
  );
}

function Position({ s, met, stage }: { s: Snapshot; met: Met; stage: StageId }) {
  const last = s.days[s.days.length - 1];
  const today = s.open ? s.dayPnl : 0;
  const week = weekPnl(s.days, s.calendar.week, today);
  const held = s.positions.filter((p) => p.qty !== 0);
  const balances = shownBalances(s);
  const cause = last ? dayCause(last) : null;
  return (
    <Section
      id="ov-position"
      tut="overview"
      title="Position"
      how={
        <>
          What the firm is worth and how this week is going, then yesterday in a sentence. Read{' '}
          <Term id="pnl">P&L</Term> as the change since the open, after fees.
        </>
      }
      note={
        <p>
          Equity is cash plus the open positions at today&apos;s prices. Today so far counts from the open and resets at
          the next one; this week adds the closed days of the week to today. Nothing here is a forecast: it is the
          firm&apos;s books, read the way a desk reads them each morning before deciding what to change.
        </p>
      }
    >
      <dl className="ov-stats">
        <div>
          <dt>Equity</dt>
          <dd className="num">{money(s.equity)}</dd>
        </div>
        <div>
          <dt>{s.open ? 'Today so far' : 'Last session'}</dt>
          <dd className={`num ${upDown(s.open ? s.dayPnl : (last?.pnl ?? 0))}`}>
            {signedMoney(s.open ? s.dayPnl : (last?.pnl ?? 0))}
          </dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd className={`num ${upDown(week)}`}>{signedMoney(week)}</dd>
        </div>
        <div>
          <dt>Cash</dt>
          <dd className="num">{money(s.cash)}</dd>
        </div>
        <div>
          <dt>Open positions</dt>
          <dd className="num">{held.length}</dd>
        </div>
        {s.margin && (
          <div>
            <dt>
              <Term id="margin">Margin</Term> to keep
            </dt>
            <dd className={`num ${s.equity < s.margin.maintenance * 1.25 ? 'down' : ''}`}>
              {money(s.margin.maintenance)}
            </dd>
          </div>
        )}
      </dl>
      {balances.length > 0 && (
        // A row a currency once it holds something or the desk has traded; appended below the stats, a one-off.
        <dl className="ov-stats ov-balances">
          {balances.map((b) => (
            <div key={b.currency}>
              <dt>
                {b.name} <Term id="home-currency">in dollars</Term>
              </dt>
              <dd className="num">
                {balance(b.amount, b.minor, b.currency)} <span className="muted">({money(b.dollars)})</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="small">
        <span className="muted">Setup: </span>
        {setupLine(s)}
      </p>
      {(s.rentDue > 0 || s.rentPaid > 0) && (
        // Appears with the first seat that has a rent, below the setup line; a line of its own.
        <p className="small ov-rent" data-testid="ov-rent">
          {RENT_WORDS.due(money(s.rentDue))} {s.rentPaid > 0 && RENT_WORDS.paid(money(s.rentPaid))}{' '}
          <Term id="rent">Read more</Term>
        </p>
      )}
      <p className="ov-line small">
        {last ? (
          <>
            <span className="muted">
              Yesterday ({last.weekday}, week {last.week}):{' '}
            </span>
            <span className={`num ${upDown(last.pnl)}`}>{signedMoney(last.pnl)}</span>, {dayVerdict(last)}
            {last.regime ? `, a ${REGIMES.find((r) => r.id === last.regime)?.name.toLowerCase() ?? last.regime}` : ''}.
            {cause && (
              <>
                {' '}
                {cause.text}
                {cause.term && (
                  <>
                    {' '}
                    <Term id={cause.term}>Read more</Term>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <span className="muted">
            No day has closed yet. After the first close this says how it went in a sentence.
          </span>
        )}
      </p>
      {/* Appended below the yesterday line; it grows downward as stages open. */}
      <Targets s={s} met={met} stage={stage} />
    </Section>
  );
}

function Today({ s, stage }: { s: Snapshot; stage: number }) {
  const pts = s.intraday;
  const xs = pts.map((p) => (calendar(p.at).timeOfDay - MARKET_OPEN) / MS_PER_MINUTE);
  const span = (MARKET_CLOSE - MARKET_OPEN) / MS_PER_MINUTE;
  const equity: Line[] = [{ name: 'Equity', ...lineStyle(0), values: pts.map((p) => p.equity) }];
  const ids = [...new Set(pts.flatMap((p) => Object.keys(p.byBlock)))].filter((id) => blockShown(id, stage as 1));
  const blocks: Line[] = ids.map((id, i) => ({
    name: blockName(id),
    ...lineStyle(i),
    values: pts.map((p) => p.byBlock[id] ?? 0),
  }));
  const which = s.open ? 'today' : 'the session that closed';
  return (
    <Section
      id="ov-today"
      title="Today so far"
      how={
        <>
          Equity through the day by the minute, and each block&apos;s <Term id="attribution">net result</Term> on its
          own line. A block that bleeds at the open or on a headline shows it here first.
        </>
      }
      note={
        <p>
          A point a simulated minute, from 09:30 to 16:00. The block lines are fills less fees since the open, by the
          block that made them, so they add up to the realised result, not the equity (which also marks open positions).
          In closed hours this shows the session that closed, until the next open clears it.
        </p>
      }
    >
      {pts.length === 0 ? (
        <p className="ov-empty muted">
          {s.open
            ? 'The first point arrives a minute after the open.'
            : 'The market is closed. From the open, a point a minute draws here: equity, and a line for each block.'}
        </p>
      ) : (
        <p className="ov-line small muted">{`Showing ${which}: ${pts.length} points.`}</p>
      )}
      <div className="ov-charts">
        <figure>
          <figcaption className="small">Equity</figcaption>
          <LineChart xs={xs} lines={equity} domain={[0, span]} format={axisMoney} label="Equity through the day" />
          <Legend lines={equity} format={axisMoney} />
        </figure>
        <figure>
          <figcaption className="small">Net by block</figcaption>
          <LineChart
            xs={xs}
            lines={blocks}
            domain={[0, span]}
            format={axisMoney}
            zero
            label="Net result of each block through the day"
          />
          <Legend lines={blocks} format={axisMoney} />
        </figure>
      </div>
    </Section>
  );
}

function Trends({ s, stage }: { s: Snapshot; stage: number }) {
  const days = s.days;
  const keep = (id: string) => blockShown(id, stage as 1);
  const bd = blockDays(days, keep);
  const xs = days.map((_, i) => i);
  const domain: [number, number] = [0, Math.max(days.length - 1, 9)];
  const blockLines: Line[] = bd.blocks.map((b, i) => ({ name: blockName(b), ...lineStyle(i), values: bd.series[b]! }));
  const races = shows('races', stage as 1);
  const fastest = s.competitors.length ? Math.min(...s.competitors.map((c) => nearest(c.latency) ?? Infinity)) : null;
  const mine = nearest(s.latency);
  const shareLine: Line[] = [{ name: 'Races won', ...lineStyle(0), values: raceShares(days) }];
  const feeLine: Line[] = [{ name: 'Fees of gross', ...lineStyle(1), values: feeShares(days) }];
  const rt = regimeTable(days, keep);
  return (
    <Section
      id="ov-trends"
      title="Trends"
      how={
        <>
          Every day kept, oldest left. Bars are each day&apos;s <Term id="pnl">P&L</Term> and the line is equity at the
          close; the rest split it by block, races, fees and kind of day.
        </>
      }
      note={
        <>
          <p>
            One day is weather; a trend is climate. A block that is up in the total and down for three days running is
            being carried, and the block lines show that (<Term id="attribution">attribution</Term>). The table at the
            bottom is <Term id="regime-dependence">regime dependence</Term>: how each block averages on each kind of day
            (<Term id="regimes">regimes</Term>), with the number of days behind each average. Two or three days is a
            hint and no more (<Term id="sample">sample</Term>).
          </p>
          <p>
            Fees as a share of gross is fees over what the trades made before fees: above a half, the fee is the
            business. Races won is the share of immediate-or-cancel races filled in full; a nearer seat moves it.
          </p>
        </>
      }
    >
      {days.length === 0 ? (
        <p className="ov-empty muted">
          Nothing yet. After each close a day is added: P&L bars with equity, a line for each block, the share of races
          won, fees against gross, and, once there are days of more than one kind, each block by kind of day.
        </p>
      ) : null}
      <div className="ov-charts">
        <figure>
          <figcaption className="small">Daily P&L and equity</figcaption>
          <PnlChart days={days} />
          <p className="small muted ov-cap">
            {days.length === 0
              ? 'Each bar a day, green up and red down, with “up” and “down” in the figures below.'
              : `${days.length} day${days.length === 1 ? '' : 's'}; latest ${signedMoney(days[days.length - 1]!.pnl)}.`}
          </p>
        </figure>
        <figure>
          <figcaption className="small">Net by block, day by day</figcaption>
          <LineChart
            xs={xs}
            lines={blockLines}
            domain={domain}
            format={axisMoney}
            zero
            label="Net result of each block, by day"
          />
          <Legend lines={blockLines} format={axisMoney} />
        </figure>
        {races && (
          <figure>
            <figcaption className="small">Races won</figcaption>
            <LineChart
              xs={xs}
              lines={shareLine}
              domain={domain}
              format={axisPct}
              yRange={[0, 1]}
              label="Share of races won, by day"
            />
            <p className="small muted ov-cap">
              Your nearest <Term id="latency">latency</Term> {mine === null ? '—' : ms(mine)}; the fastest rival&apos;s{' '}
              {fastest === null || !Number.isFinite(fastest) ? '—' : ms(fastest)}. The nearer you are, the more you win.
            </p>
          </figure>
        )}
        <figure>
          <figcaption className="small">Fees as a share of gross</figcaption>
          <LineChart
            xs={xs}
            lines={feeLine}
            domain={domain}
            format={axisPct}
            yRange={[0, 1]}
            label="Fees as a share of gross, by day"
          />
          <p className="small muted ov-cap">
            <Term id="maker-taker">Fees</Term> over the trades&apos; gross. A gap in the line is a day with no gross.
          </p>
        </figure>
      </div>
      <h3>Each block&apos;s average day, by kind of day</h3>
      <div className="ov-scroll">
        {rt.rows.length === 0 ? (
          <p className="ov-empty muted">
            Appears once a block has traded on days the game has named a kind for. A block that earns on calm days and
            loses on trending ones shows as a plus in one column and a minus in the next.
          </p>
        ) : (
          <table className="ov-table">
            <thead>
              <tr>
                <th>Block</th>
                {rt.regimes.map((r) => (
                  <th key={r} className="num">
                    {REGIMES.find((x) => x.id === r)?.name ?? r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rt.rows.map((row) => (
                <tr key={row.block}>
                  <td>{blockName(row.block)}</td>
                  {rt.regimes.map((r) => {
                    const c = row.cells[r];
                    return (
                      <td key={r} className={`num ${c ? upDown(c.avg) : 'muted'}`}>
                        {c ? (
                          <>
                            {signedMoney(c.avg)} <span className="muted small">({c.days}d)</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Section>
  );
}

function SignalsSection({ sigs, tests }: { sigs: Signal[]; tests: ReturnType<Store['getTests']> }) {
  const night = latestWithRuns(tests.nights);
  const rows = night ? compare(night) : [];
  return (
    <Section
      id="ov-signals"
      title="Signals"
      how={
        <>
          What the reports say is worth a look, strongest first: what was seen, why it matters, and what would test it.
          A signal is a question, not an order.
        </>
      }
      note={
        <p>
          The game reads the closed days and raises at most six signals. Several end in a test the game runs overnight
          (see Comparisons). A signal can be luck: one stock carrying the result, or three bad days, may be{' '}
          <Term id="overfitting">noise</Term>, so look for the same signal on more than one day before acting.
        </p>
      }
    >
      <div className="ov-signals">
        {sigs.length === 0 ? (
          <p className="ov-empty muted">
            Nothing to look at yet. After a few closes the game raises up to six: races lost to a named rival, fees
            eating the edge, a block that bleeds, a block that lives by the weather, and the like. Each says what it
            saw, why it matters, and what would test it.
          </p>
        ) : (
          <ul>
            {sigs.map((g) => {
              const ran = rows.find((r) => r.signals.includes(g.id) && r.compared > 0);
              return (
                <li key={g.id}>
                  <strong>{g.title}</strong>
                  <p className="small">{g.seen}</p>
                  <p className="small muted">
                    {g.why} {g.term && <Term id={g.term}>Read more</Term>}
                  </p>
                  {g.test && (
                    <p className="small">
                      <span className="muted">To test: </span>
                      {g.test}{' '}
                      {ran ? (
                        <a href="#ov-comparisons">
                          Tested: {ran.label}, {ran.summary}.
                        </a>
                      ) : null}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}
