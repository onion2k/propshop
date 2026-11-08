// The free-play save as the browser keeps it. A save is about eight million characters of JSON five minutes into
// the open, most of it the exchanges' quote logs, past what localStorage holds (about five million). Packed with
// the browser's own gzip and written as base64 behind a prefix, it is about 600,000. The gzip and the base64 run
// on the calling thread, so the page packs in a worker of its own (`save.worker.ts`) and the main thread pays for
// the JSON and the copy alone. A plain JSON save, from before packing, still reads. This file imports nothing, so
// the worker carries only it.

const PREFIX = 'gz:';
/** How many bytes go to String.fromCharCode at once: past about 65,000 arguments a call overflows the stack. */
const CHUNK = 0x8000;

export async function packSave(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return PREFIX + btoa(bin);
}

export async function unpackSave(raw: string): Promise<string> {
  if (!raw.startsWith(PREFIX)) return raw;
  const bin = atob(raw.slice(PREFIX.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** The kept save as JSON, or none: nothing kept, or a broken one, which the game meets by starting again. */
export async function readSave(raw: string | null): Promise<string | null> {
  if (!raw) return null;
  try {
    return await unpackSave(raw);
  } catch {
    return null;
  }
}

/** What the page's save worker is sent and sends back. */
export interface PackRequest {
  id: number;
  json: string;
}
export type PackReply = { id: number; packed: string } | { id: number; error: string };

/** The part of a Worker the packer uses, so a test can stand in for one. */
export interface PackWorker {
  postMessage(m: PackRequest): void;
  addEventListener(type: 'message', f: (e: MessageEvent<PackReply>) => void): void;
  addEventListener(type: 'error', f: (e: Event) => void): void;
  terminate(): void;
}

/**
 * Packs in a worker. A worker that fails, or one that cannot be made, gives way to packing on the main thread for
 * the rest of the session: a slow save is better than none.
 */
export function workerPacker(make: () => PackWorker): (json: string) => Promise<string> {
  let worker: PackWorker | null = null;
  let broken = false;
  let next = 0;
  const waiting = new Map<number, { json: string; resolve: (s: string) => void; reject: (e: Error) => void }>();
  const giveUp = () => {
    broken = true;
    worker?.terminate();
    worker = null;
    for (const w of waiting.values()) packSave(w.json).then(w.resolve, w.reject);
    waiting.clear();
  };
  return (json) => {
    if (!broken && !worker) {
      try {
        worker = make();
        worker.addEventListener('message', (e) => {
          const w = waiting.get(e.data.id);
          if (!w) return;
          waiting.delete(e.data.id);
          if ('packed' in e.data) w.resolve(e.data.packed);
          else w.reject(new Error(e.data.error));
        });
        worker.addEventListener('error', giveUp);
      } catch {
        broken = true;
      }
    }
    if (broken || !worker) return packSave(json);
    const id = next++;
    const w = worker;
    return new Promise((resolve, reject) => {
      waiting.set(id, { json, resolve, reject });
      w.postMessage({ id, json });
    });
  };
}
