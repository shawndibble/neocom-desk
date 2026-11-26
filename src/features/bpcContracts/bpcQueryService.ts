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
