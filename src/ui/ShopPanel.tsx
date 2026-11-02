// The shop: offices, networks and computers, with what each does to the latency to each exchange.

import type { Snapshot, UpgradeKind, UpgradeOffer } from '../sim';
import { moneyShort, ms } from './format';
import { Term } from './Glossary';
import type { Store } from './store';

const KINDS: { kind: UpgradeKind; title: string; term: string }[] = [
  { kind: 'location', title: 'Office', term: 'colocation' },
  { kind: 'network', title: 'Network', term: 'microwave' },
  { kind: 'computer', title: 'Computer', term: 'capacity' },
];

export function ShopPanel({ s, store }: { s: Snapshot; store: Store }) {
  return (
    <div className="shop">
      <p className="muted">
        Your <Term id="latency">latency</Term> today:{' '}
        {Object.entries(s.latency)
          .map(([e, l]) => `${e} ${ms(l)}`)
          .join(', ')}
        . Cash {moneyShort(s.cash)}.
      </p>
      {KINDS.map(({ kind, title, term }) => (
        <div key={kind}>
          <h3>
            {title}{' '}
            <span className="muted small">
              · <Term id={term} />
            </span>
          </h3>
          <ul>
            {s.shop
              .filter((o) => o.kind === kind)
              .map((o) => (
                <Offer key={o.spec.id} o={o} s={s} store={store} />
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "HARBOR 0.6ms, LAKESIDE 4.4ms", or where data lags orders, "LAKESIDE orders 0.6ms, data 4.4ms". */
export function latencies(orders: Record<string, number>, data: Record<string, number>): string {
  return Object.entries(orders)
    .map(([e, l]) => {
      const d = data[e] ?? l;
      return d === l ? `${e} ${ms(l)}` : `${e} orders ${ms(l)}, data ${ms(d)}`;
    })
    .join(', ');
}

function Offer({ o, s, store }: { o: UpgradeOffer; s: Snapshot; store: Store }) {
  const extra =
    o.kind === 'computer' && 'maxBlocks' in o.spec
      ? `${o.spec.maxBlocks} blocks, every ${o.spec.decisionEveryMs}ms, ${o.spec.ordersPerSecond} orders/s`
      : latencies(o.latency, o.dataLatency);
  return (
    <li className={`offer ${o.inUse ? 'in-use' : ''}`}>
      <div>
        <strong>{o.spec.name}</strong> <span className="muted small">{extra}</span>
        <p className="small">{o.spec.explain}</p>
      </div>
      <button type="button" disabled={o.inUse || !o.affordable} onClick={() => store.buyUpgrade(o.kind, o.spec.id)}>
        {o.inUse
          ? 'in use'
          : o.owned
            ? 'switch'
            : s.cash >= o.spec.price
              ? `buy ${moneyShort(o.spec.price)}`
              : moneyShort(o.spec.price)}
      </button>
    </li>
  );
}
