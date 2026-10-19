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
import { createWorkerClient } from '@/lib/workerClient';
import type { BpcQueryReply, BpcQueryRequest, BpcRestData } from './bpcQuery.worker';

let nextPrepareVersion = 0;
let loadedRows: Pick<BpcSourceData, 'contractRows' | 'originals'> | null = null;
let loadedRest: BpcRestData | null = null;
let sentPrepare: { input: BpcPrepareInput; version: number } | null = null;

export const SUPERSEDED = 'superseded';

function forgetLoaded() {
  loadedRows = null;
  loadedRest = null;
  sentPrepare = null;
}

const client = createWorkerClient<BpcQueryReply, BpcRankReplyParts>({
  spawn: () => new Worker(new URL('./bpcQuery.worker.ts', import.meta.url), { type: 'module' }),
  settle: (reply, waiting) => {
    if ('parts' in reply) waiting.resolve(reply.parts);
    else waiting.reject(new Error('superseded' in reply ? SUPERSEDED : reply.error));
  },
  unavailable: (message) => new Error(message),
  reset: forgetLoaded,
});

/** Whether a query can go to the worker; false once it has failed. */
export const bpcQueryWorkerAvailable = client.available;

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
  return client.send((target, id) => {
    const { rows, rest } = splitSourceData(data);
    if (loadedRows?.contractRows !== rows.contractRows || loadedRows.originals !== rows.originals) {
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
    const sent = isNewInput ? { input: prepareInput, version: ++nextPrepareVersion } : sentPrepare!;
    sentPrepare = sent;
    const request: BpcQueryRequest = {
      kind: 'query',
      id,
      prepareVersion: sent.version,
      ...(isNewInput ? { prepareInput } : {}),
      query,
    };
    target.postMessage(request);
  });
}
