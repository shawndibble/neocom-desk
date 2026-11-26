import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type {
  ContractOfferQuery,
  ContractOfferQueryResult,
} from '@/engine/contracts/contractSearchQuery';
import type { ContractQueryReply, ContractQueryRequest } from './contractQuery.worker';

let worker: Worker | null = null;
let workerBroken = false;
let nextRequest = 0;
let nextSnapshot = 0;
let loaded: { rows: readonly PublicContractOfferRow[]; snapshot: number } | null = null;
const pending = new Map<
  number,
  { resolve: (result: ContractOfferQueryResult) => void; reject: (reason: Error) => void }
>();

export const SUPERSEDED = 'superseded';

function failPending(reason: Error) {
  for (const { reject } of pending.values()) reject(reason);
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./contractQuery.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<ContractQueryReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('indices' in reply) {
      waiting.resolve({ indices: reply.indices, stats: new Map(reply.stats) });
    } else {
      waiting.reject(new Error('superseded' in reply ? SUPERSEDED : reply.error));
    }
  };
  const fail = () => {
    workerBroken = true;
    worker?.terminate();
    worker = null;
    loaded = null;
    failPending(new Error('worker failed'));
  };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  return worker;
}

export function contractQueryWorkerAvailable(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

export function askContractQuery(
  rows: readonly PublicContractOfferRow[],
  query: ContractOfferQuery
): Promise<ContractOfferQueryResult> {
  const target = ensureWorker();
  if (!target) return Promise.reject(new Error('no worker'));
  const id = ++nextRequest;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      if (loaded?.rows !== rows) {
        loaded = { rows, snapshot: ++nextSnapshot };
        const load: ContractQueryRequest = { kind: 'load', snapshot: loaded.snapshot, rows };
        target.postMessage(load);
      }
      const request: ContractQueryRequest = { kind: 'query', id, snapshot: loaded.snapshot, query };
      target.postMessage(request);
    } catch (error) {
      pending.delete(id);
      loaded = null;
      reject(error instanceof Error ? error : new Error('post failed'));
    }
  });
}
