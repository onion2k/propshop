import { CONTENT } from '../src/content';
import { Game } from '../src/sim';
import {
  packSave,
  readSave,
  unpackSave,
  workerPacker,
  type PackReply,
  type PackRequest,
  type PackWorker,
} from '../src/ui/savefile';
import { createStore, SAVE_KEY, type Storage } from '../src/ui/store';

/** The browser's usual limit, about five million characters across the origin. */
const QUOTA = 5_000_000;

/** A storage that refuses what does not fit, as localStorage does. */
function limited(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      let used = v.length;
      for (const [key, val] of data) if (key !== k) used += val.length;
      if (used > QUOTA) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

/** A game five minutes into the open: the quote logs are full, and the save is about eight million characters. */
function intoTheOpen(seed: number): Game {
  const g = new Game(CONTENT, seed);
  g.skipToOpen();
  for (let i = 0; i < (5 * 60_000) / 2; i++) g.step();
  return g;
}

describe('the save as the browser keeps it', () => {
  it('packs to a fraction of its JSON and unpacks to the same text', async () => {
    const json = JSON.stringify(intoTheOpen(7).save());
    expect(json.length).toBeGreaterThan(QUOTA);
    const packed = await packSave(json);
    expect(packed.length).toBeLessThan(QUOTA / 5);
    expect(await unpackSave(packed)).toBe(json);
  }, 60_000);

  it('reads a plain JSON save from before packing as it is, and a broken one as none', async () => {
    expect(await unpackSave('{"version":2}')).toBe('{"version":2}');
    expect(await readSave(null)).toBeNull();
    expect(await readSave('gz:not base64 at all')).toBeNull();
  });

  it('keeps a free-play game five minutes into the open across a reload', async () => {
    const storage = limited();
    const store = createStore(CONTENT, storage, 11, undefined, undefined, { pack: packSave });
    store.game.skipToOpen();
    store.stepTicks((5 * 60_000) / 2);
    const now = store.game.now;
    await store.save();
    expect(storage.data.get(SAVE_KEY)?.startsWith('gz:')).toBe(true);
    const again = createStore(CONTENT, storage, 99, undefined, undefined, {
      saved: await readSave(storage.getItem(SAVE_KEY)),
    });
    expect(again.game.now).toBe(now);
    expect(JSON.stringify(again.game.save())).toBe(JSON.stringify(store.game.save()));
  }, 60_000);

  it('lets a save still packing when the game is started again land nowhere', async () => {
    const storage = limited();
    let finish!: (s: string) => void;
    const store = createStore(CONTENT, storage, 3, undefined, undefined, {
      pack: () => new Promise<string>((r) => (finish = r)),
    });
    const pending = store.save();
    store.reset(4);
    finish('gz:stale');
    await pending;
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });

  it('writes only the newest of two saves packing at once', async () => {
    const storage = limited();
    const done: ((s: string) => void)[] = [];
    const store = createStore(CONTENT, storage, 3, undefined, undefined, {
      pack: () => new Promise<string>((r) => done.push(r)),
    });
    const first = store.save();
    const second = store.save();
    done[1]!('gz:second');
    done[0]!('gz:first');
    await Promise.all([first, second]);
    expect(storage.data.get(SAVE_KEY)).toBe('gz:second');
  });

  it('packs in a worker, and on the main thread once the worker fails', async () => {
    const posted: PackRequest[] = [];
    let reply!: (e: MessageEvent<PackReply>) => void;
    let fail!: (e: Event) => void;
    let made = 0;
    const fake: PackWorker = {
      postMessage: (m) => void posted.push(m),
      addEventListener: (type: string, f: never) => {
        if (type === 'message') reply = f;
        else fail = f;
      },
      terminate: () => {},
    };
    const pack = workerPacker(() => (made++, fake));
    const a = pack('{"a":1}');
    expect(posted).toHaveLength(1);
    reply({ data: { id: posted[0]!.id, packed: 'gz:from-worker' } } as MessageEvent<PackReply>);
    expect(await a).toBe('gz:from-worker');
    const b = pack('{"b":2}');
    fail(new Event('error'));
    expect(await unpackSave(await b)).toBe('{"b":2}');
    expect(await unpackSave(await pack('{"c":3}'))).toBe('{"c":3}');
    expect(posted).toHaveLength(2);
    expect(made).toBe(1);
  });

  it('packs on the main thread where no worker can be made', async () => {
    const pack = workerPacker(() => {
      throw new Error('no workers here');
    });
    expect(await unpackSave(await pack('{"d":4}'))).toBe('{"d":4}');
  });
});
