// Packs the free-play save off the main thread: the gzip and the base64 of eight million characters would hold a
// frame for about 150 ms on a phone. See `src/ui/savefile.ts`.
import { packSave, type PackReply, type PackRequest } from './ui/savefile';

self.addEventListener('message', (e: MessageEvent<PackRequest>) => {
  const { id, json } = e.data;
  packSave(json).then(
    (packed) => self.postMessage({ id, packed } satisfies PackReply),
    (err: unknown) => self.postMessage({ id, error: String(err) } satisfies PackReply),
  );
});
