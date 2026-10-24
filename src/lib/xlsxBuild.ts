/**
 * Every .xlsx export's file without freezing the page (#4959). Cells are read here in yielding
 * slices (column `value` functions are closures, so they can't cross to a worker); `xlsx.worker.ts`
 * writes the XML and zip. No Worker, or a lost one: the page writes it with the same writer.
 */
import { createWorkerClient } from './workerClient';
import { writeWorkbook, type AnyXlsxSheet, type PlainSheet } from './xlsx';
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

/** `resolveSheet` with a yield every slice; the count spans sheets, so many small ones yield too. */
async function resolveInSlices(sheets: readonly AnyXlsxSheet[]): Promise<PlainSheet[]> {
  const plain: PlainSheet[] = [];
  let read = 0;
  for (const { name, rows, columns } of sheets) {
    const resolved: PlainSheet = { name, headers: columns.map((c) => c.header), rows: [] };
    for (const row of rows) {
      resolved.rows.push(columns.map((c) => c.value(row)));
      if (++read % ROWS_PER_SLICE === 0) await yieldToPage();
    }
    plain.push(resolved);
  }
  return plain;
}

export async function buildWorkbook(sheets: readonly AnyXlsxSheet[]): Promise<Uint8Array> {
  const plain = await resolveInSlices(sheets);
  try {
    return await client.send((worker, id) => {
      const request: XlsxRequest = { id, sheets: plain };
      worker.postMessage(request);
    });
  } catch (error) {
    // A writer error would only fail again on the page; a missing or lost worker is the page's to cover.
    if (!(error instanceof XlsxWorkerUnavailable)) throw error;
  }
  return writeWorkbook(plain);
}
