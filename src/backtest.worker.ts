// The night's tests, off the main thread. The work is in nightjob.ts.
import { CONTENT } from './content';
import { handleJob, type JobEvent, type NightJob } from './nightjob';

self.addEventListener('message', (e: MessageEvent<NightJob>) => {
  handleJob(CONTENT, e.data, (m: JobEvent) => self.postMessage(m));
});
