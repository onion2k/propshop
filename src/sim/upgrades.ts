// The shop: offices, networks and computers, each a line in the content with a price and an effect. Buying one
// puts it in use at once; what was bought before stays owned and can be switched back to for nothing.

import type { Firm } from './firm';
import { dataLatencyTo, latencyTo } from './latency';
import type { ComputerSpec, Content, Infrastructure, LocationSpec, NetworkSpec } from './types';

export type UpgradeKind = 'location' | 'network' | 'computer';

export interface UpgradeOffer {
  kind: UpgradeKind;
  spec: LocationSpec | NetworkSpec | ComputerSpec;
  owned: boolean;
  inUse: boolean;
  affordable: boolean;
  /** Order and data latency to each exchange were this in use, so the shop can show before and after. */
  latency: Record<string, number>;
  dataLatency: Record<string, number>;
}

export function infrastructureFrom(
  content: Content,
  ids: { location: string; network: string; computer: string },
): Infrastructure {
  const location = content.locations.find((l) => l.id === ids.location);
  const network = content.networks.find((n) => n.id === ids.network);
  const computer = content.computers.find((c) => c.id === ids.computer);
  if (!location || !network || !computer) throw new Error(`Unknown infrastructure ${JSON.stringify(ids)}`);
  return { location, network, computer };
}

export function withUpgrade(
  infra: Infrastructure,
  kind: UpgradeKind,
  spec: Infrastructure[UpgradeKind],
): Infrastructure {
  return { ...infra, [kind]: spec };
}

export function catalogue(content: Content, firm: Firm, owned: ReadonlySet<string>): UpgradeOffer[] {
  const out: UpgradeOffer[] = [];
  const add = (kind: UpgradeKind, specs: Infrastructure[UpgradeKind][]) => {
    for (const spec of specs) {
      const infra = withUpgrade(firm.infra, kind, spec);
      const latency: Record<string, number> = {};
      const dataLatency: Record<string, number> = {};
      for (const e of Object.keys(firm.infra.location.distance)) {
        latency[e] = latencyTo(infra, e);
        dataLatency[e] = dataLatencyTo(infra, e);
      }
      out.push({
        kind,
        spec,
        owned: owned.has(spec.id),
        inUse: firm.infra[kind].id === spec.id,
        affordable: owned.has(spec.id) || firm.cash >= spec.price,
        latency,
        dataLatency,
      });
    }
  };
  add('location', content.locations);
  add('network', content.networks);
  add('computer', content.computers);
  return out;
}

/** Buy or switch to an upgrade. Throws where the firm cannot afford it. */
/** Buys (or switches to) an upgrade and returns the cents paid: nothing for one already owned. */
export function buyUpgrade(content: Content, firm: Firm, owned: Set<string>, kind: UpgradeKind, id: string): number {
  const specs: Infrastructure[UpgradeKind][] =
    kind === 'location' ? content.locations : kind === 'network' ? content.networks : content.computers;
  const spec = specs.find((s) => s.id === id);
  if (!spec) throw new Error(`No ${kind} ${id}`);
  let paid = 0;
  if (!owned.has(id)) {
    if (firm.cash < spec.price) throw new Error(`Not enough cash for ${spec.name}`);
    firm.cash -= spec.price;
    owned.add(id);
    paid = spec.price;
  }
  firm.infra = withUpgrade(firm.infra, kind, spec);
  return paid;
}
