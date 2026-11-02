// Latency: how long a message takes between the firm and an exchange, and a queue that holds messages until
// they arrive. Every order and every fill goes through here, so a firm never acts on the present, only on
// the past as it reached them. That delay is what the player pays to shrink.

import type { Infrastructure } from './types';

/** One-way latency in ms from a firm with this infrastructure to the exchange. Never under a millisecond. */
export function latencyTo(infra: Infrastructure, exchangeId: string): number {
  const distance = infra.location.distance[exchangeId];
  if (distance === undefined) throw new Error(`${infra.location.id} has no distance to ${exchangeId}`);
  return Math.max(1, distance * infra.network.factor + infra.network.overhead);
}

export interface Delayed<T> {
  at: number;
  item: T;
}

/** The most messages a queue may hold; a firm that floods it loses the overflow, as a real line would. */
export const MAX_IN_FLIGHT = 2000;

export class DelayQueue<T> {
  private items: Delayed<T>[] = [];

  constructor(items: Delayed<T>[] = []) {
    this.items = items;
  }

  /** Returns false when the queue is full and the item was dropped. */
  push(item: T, at: number): boolean {
    if (this.items.length >= MAX_IN_FLIGHT) return false;
    // Keep the queue sorted by arrival so delivery is in order and in O(n) for the common case of appending.
    let i = this.items.length;
    while (i > 0 && (this.items[i - 1]?.at ?? -Infinity) > at) i--;
    this.items.splice(i, 0, { at, item });
    return true;
  }

  /** Everything that has arrived by now, in arrival order. */
  pop(now: number): T[] {
    let n = 0;
    while (n < this.items.length && (this.items[n]?.at ?? Infinity) <= now) n++;
    return this.items.splice(0, n).map((d) => d.item);
  }

  get length(): number {
    return this.items.length;
  }

  clear(): T[] {
    const all = this.items.map((d) => d.item);
    this.items = [];
    return all;
  }

  save(): Delayed<T>[] {
    return this.items;
  }
}
