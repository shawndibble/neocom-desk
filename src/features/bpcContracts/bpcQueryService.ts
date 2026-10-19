/**
 * BPC Sourcing's prepare / rank as one shared worker call (`useBpcOfferSearch`
 * is its only caller). The worker gets the contract rows once — again only
 * when the page holds different arrays — the rest of the source data when any
 * of its fields changes, and stage 1's input when it changes; then it answers
 * each query with indices into the rows it was given. Where there is no
 * Worker (jsdom, old browsers), or it has failed, `bpcQueryWorkerAvailable`
 * says so and the caller runs the same pure functions on the page.
 */
import type {
  BpcPrepareInput,
  BpcQuery,
  BpcRankReplyParts,
  BpcSourceData,
} from './searchBpcOffers';
import type { BpcQueryReply, BpcQueryRequest, BpcRestData } from './bpcQuery.worker';

let worker: Worker | null = null;
let workerBroken = false;
let nextRequest = 0;
let nextPrepareVersion = 0;
let loadedRows: Pick<BpcSourceData, 'contractRows' | 'originals'> | null = null;
let loadedRest: BpcRestData | null = null;
let sentPrepare: { input: BpcPrepareInput; version: number } | null = null;
const pending = new Map<
  number,
  { resolve: (parts: BpcRankReplyParts) => void; reject: (reason: Error) => void }
>();

export const SUPERSEDED = 'superseded';

function failPending(reason: Error) {
  for (const { reject } of pending.values()) reject(reason);
  pending.clear();
}

function forgetLoaded() {
  loadedRows = null;
  loadedRest = null;
  sentPrepare = null;
}

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./bpcQuery.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<BpcQueryReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('parts' in reply) waiting.resolve(reply.parts);
    else waiting.reject(new Error('superseded' in reply ? SUPERSEDED : reply.error));
  };
  const fail = () => {
    workerBroken = true;
    worker?.terminate();
    worker = null;
    forgetLoaded();
    failPending(new Error('worker failed'));
  };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  return worker;
}

/** Whether a query can go to the worker; false once it has failed. */
export function bpcQueryWorkerAvailable(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

function splitSourceData(data: BpcSourceData): {
  rows: Pick<BpcSourceData, 'contractRows' | 'originals'>;
  rest: BpcRestData;
} {
  const { contractRows, originals, ...rest } = data;
  return { rows: { contractRows, originals }, rest };
}

function sameFields(a: object, b: object): boolean {
  const left = Object.entries(a);
  return (
    left.length === Object.keys(b).length &&
    left.every(([key, value]) => (b as Record<string, unknown>)[key] === value)
  );
}

/** Rejects with `SUPERSEDED` when a newer query replaced this one before it ran. */
export function askBpcQuery(
  data: BpcSourceData,
  prepareInput: BpcPrepareInput,
  query: BpcQuery
): Promise<BpcRankReplyParts> {
  const target = ensureWorker();
  if (!target) return Promise.reject(new Error('no worker'));
  const id = ++nextRequest;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      const { rows, rest } = splitSourceData(data);
      if (
        loadedRows?.contractRows !== rows.contractRows ||
        loadedRows.originals !== rows.originals
      ) {
        loadedRows = rows;
        const load: BpcQueryRequest = { kind: 'rows', ...rows };
        target.postMessage(load);
      }
      if (!loadedRest || !sameFields(loadedRest, rest)) {
        loadedRest = rest;
        const load: BpcQueryRequest = { kind: 'rest', rest };
        target.postMessage(load);
      }
      const isNewInput = sentPrepare?.input !== prepareInput;
      const sent = isNewInput
        ? { input: prepareInput, version: ++nextPrepareVersion }
        : sentPrepare!;
      sentPrepare = sent;
      const request: BpcQueryRequest = {
        kind: 'query',
        id,
        prepareVersion: sent.version,
        ...(isNewInput ? { prepareInput } : {}),
        query,
      };
      target.postMessage(request);
    } catch (error) {
      // Cloning the snapshot can fail (memory): the page answers instead.
      pending.delete(id);
      forgetLoaded();
      reject(error instanceof Error ? error : new Error('post failed'));
    }
  });
}
