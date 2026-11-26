/// <reference lib="webworker" />
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ContractOfferStats } from '@/engine/contracts/contractSearch';
import {
  queryContractOffers,
  type ContractOfferQuery,
} from '@/engine/contracts/contractSearchQuery';

export type ContractQueryRequest =
  | { kind: 'load'; snapshot: number; rows: readonly PublicContractOfferRow[] }
  | { kind: 'query'; id: number; snapshot: number; query: ContractOfferQuery };

export type ContractQueryReply =
  | { id: number; indices: Uint32Array; stats: [number, ContractOfferStats][] }
  | { id: number; superseded: true }
  | { id: number; error: string };

export interface ContractQueryState {
  snapshot: number;
  rows: readonly PublicContractOfferRow[];
}

export function answerContractQuery(
  state: ContractQueryState,
  request: Extract<ContractQueryRequest, { kind: 'query' }>
): ContractQueryReply {
  if (request.snapshot !== state.snapshot) return { id: request.id, error: 'snapshot not loaded' };
  const { indices, stats } = queryContractOffers(state.rows, request.query);
  return { id: request.id, indices, stats: [...stats] };
}

if (typeof WorkerGlobalScope !== 'undefined') {
  const state: ContractQueryState = { snapshot: 0, rows: [] };
  let waiting: Extract<ContractQueryRequest, { kind: 'query' }> | null = null;
  const run = () => {
    const request = waiting;
    waiting = null;
    if (request === null) return;
    let reply: ContractQueryReply;
    try {
      reply = answerContractQuery(state, request);
    } catch (error) {
      reply = { id: request.id, error: error instanceof Error ? error.message : String(error) };
    }
    self.postMessage(reply, 'indices' in reply ? [reply.indices.buffer] : []);
  };
  self.onmessage = (event: MessageEvent<ContractQueryRequest>) => {
    const request = event.data;
    if (request.kind === 'load') {
      state.snapshot = request.snapshot;
      state.rows = request.rows;
      return;
    }
    if (waiting !== null) self.postMessage({ id: waiting.id, superseded: true });
    else setTimeout(run, 0);
    waiting = request;
  };
}
