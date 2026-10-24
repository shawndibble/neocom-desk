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

/** Every sheet's cells, with a yield whenever a slice's worth of rows has been read, across sheets. */
async function resolveInSlices(sheets: readonly AnyXlsxSheet[]): Promise<PlainSheet[]> {
  const plain: PlainSheet[] = [];
  let sinceYield = 0;
  for (const sheet of sheets) {
    const resolved = resolveSheet({ ...sheet, rows: [] });
    for (let start = 0; start < sheet.rows.length; start += ROWS_PER_SLICE) {
      if (sinceYield >= ROWS_PER_SLICE) {
        await yieldToPage();
        sinceYield = 0;
      }
      const slice = sheet.rows.slice(start, start + ROWS_PER_SLICE);
      for (const row of resolveSheet({ ...sheet, rows: slice }).rows) resolved.rows.push(row);
      sinceYield += slice.length;
    }
    plain.push(resolved);
  }
  return plain;
}

export async function buildWorkbook(sheets: readonly AnyXlsxSheet[]): Promise<Uint8Array> {
  const plain = await resolveInSlices(sheets);
  if (client.available()) {
    try {
      return await client.send((worker, id) => {
        const request: XlsxRequest = { id, sheets: plain };
        worker.postMessage(request);
      });
    } catch (error) {
      // A writer error would only fail again on the page; a lost worker is the page's to cover.
      if (!(error instanceof XlsxWorkerUnavailable)) throw error;
    }
  }
  return writeWorkbook(plain);
}
