/**
 * Every .xlsx export's file, built without freezing the page (#4959). The cells are read off
 * the rows here, a slice at a time with a yield between slices, since the column `value`
 * functions are closures that cannot cross to a worker. The plain cells then go to
 * `xlsx.worker.ts`, which writes the sheet XML and the zip. Where there is no Worker (jsdom,
 * old browsers), or it has failed, the page writes the file itself with the same writer.
 */
import { createWorkerClient } from './workerClient';
import { resolveSheet, writeWorkbook, type AnyXlsxSheet, type PlainSheet } from './xlsx';
import type { XlsxReply, XlsxRequest } from './xlsx.worker';

class XlsxWorkerUnavailable extends Error {}

const client = createWorkerClient<XlsxReply, Uint8Array>({
  spawn: () => new Worker(new URL('./xlsx.worker.ts', import.meta.url), { type: 'module' }),
  settle: (reply, waiting) => {
    if ('bytes' in reply) waiting.resolve(reply.bytes);
    else waiting.reject(new Error(reply.error));
  },
  unavailable: (message) => new XlsxWorkerUnavailable(message),
});

/** Rows read per slice before the page gets a turn. */
export const ROWS_PER_SLICE = 5_000;

const yieldToPage = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function resolveInSlices(sheet: AnyXlsxSheet): Promise<PlainSheet> {
  if (sheet.rows.length <= ROWS_PER_SLICE) return resolveSheet(sheet);
  const resolved = resolveSheet({ ...sheet, rows: [] });
  for (let start = 0; start < sheet.rows.length; start += ROWS_PER_SLICE) {
    if (start > 0) await yieldToPage();
    const slice = sheet.rows.slice(start, start + ROWS_PER_SLICE);
    for (const row of resolveSheet({ ...sheet, rows: slice }).rows) resolved.rows.push(row);
  }
  return resolved;
}

export async function buildWorkbook(sheets: readonly AnyXlsxSheet[]): Promise<Uint8Array> {
  const plain: PlainSheet[] = [];
  for (const sheet of sheets) plain.push(await resolveInSlices(sheet));
  if (client.available()) {
    try {
      return await client.send((worker, id) => {
        const request: XlsxRequest = { id, sheets: plain };
        worker.postMessage(request);
      });
    } catch {
      // The worker could not build it: the page does, with the same writer.
    }
  }
  return writeWorkbook(plain);
}
