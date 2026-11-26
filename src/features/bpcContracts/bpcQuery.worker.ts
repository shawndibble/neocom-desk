/// <reference lib="webworker" />
import {
  compactBpcRankParts,
  indexBpcRows,
  prepareBpcOffers,
  rankBpcParts,
  type BpcPrepareInput,
  type BpcQuery,
  type BpcRankReplyParts,
  type BpcRowIndex,
  type BpcSourceData,
  type PreparedBpcOffers,
} from './searchBpcOffers';

export type BpcRestData = Omit<BpcSourceData, 'contractRows' | 'originals'>;

export type BpcQueryRequest =
  | {
      kind: 'rows';
      contractRows: BpcSourceData['contractRows'];
      originals: BpcSourceData['originals'];
    }
  | { kind: 'rest'; rest: BpcRestData }
  | {
      kind: 'query';
      id: number;
      prepareVersion: number;
      prepareInput?: BpcPrepareInput;
      query: BpcQuery;
    };

export type BpcQueryReply =
  | { id: number; parts: BpcRankReplyParts }
  | { id: number; superseded: true }
  | { id: number; error: string };

export interface BpcQueryState {
  rows: Pick<BpcSourceData, 'contractRows' | 'originals'> | null;
  rest: BpcRestData | null;
  index: BpcRowIndex | null;
  prepareVersion: number;
  prepareInput: BpcPrepareInput | null;
  prepared: PreparedBpcOffers | null;
}

export function emptyBpcQueryState(): BpcQueryState {
  return {
    rows: null,
    rest: null,
    index: null,
    prepareVersion: 0,
    prepareInput: null,
    prepared: null,
  };
}

export function loadBpcQueryData(
  state: BpcQueryState,
  request: Exclude<BpcQueryRequest, { kind: 'query' }>
) {
  if (request.kind === 'rows') {
    state.rows = { contractRows: request.contractRows, originals: request.originals };
    state.index = null;
  } else {
    state.rest = request.rest;
  }
  state.prepared = null;
}

export function acceptBpcPrepareInput(
  state: BpcQueryState,
  request: Extract<BpcQueryRequest, { kind: 'query' }>
) {
  if (!request.prepareInput || state.prepareVersion === request.prepareVersion) return;
  state.prepareInput = request.prepareInput;
  state.prepareVersion = request.prepareVersion;
  state.prepared = null;
}

export function answerBpcQuery(
  state: BpcQueryState,
  request: Extract<BpcQueryRequest, { kind: 'query' }>
): BpcQueryReply {
  const { rows, rest } = state;
  if (!rows || !rest) return { id: request.id, error: 'data not loaded' };
  acceptBpcPrepareInput(state, request);
  if (!state.prepareInput || state.prepareVersion !== request.prepareVersion) {
    return { id: request.id, error: 'prepare input not loaded' };
  }
  const data: BpcSourceData = { ...rows, ...rest };
  state.prepared ??= prepareBpcOffers(data, state.prepareInput);
  state.index ??= indexBpcRows(data);
  const parts = rankBpcParts(state.prepared, data, request.query);
  return { id: request.id, parts: compactBpcRankParts(parts, state.index) };
}

if (typeof WorkerGlobalScope !== 'undefined') {
  const state = emptyBpcQueryState();
  let waiting: Extract<BpcQueryRequest, { kind: 'query' }> | null = null;
  const run = () => {
    const request = waiting;
    waiting = null;
    if (request === null) return;
    let reply: BpcQueryReply;
    try {
      reply = answerBpcQuery(state, request);
    } catch (error) {
      reply = { id: request.id, error: error instanceof Error ? error.message : String(error) };
    }
    if ('parts' in reply) {
      const { filteredIndices, originalIndices } = reply.parts;
      self.postMessage(reply, [filteredIndices.buffer, originalIndices.buffer]);
    } else {
      self.postMessage(reply);
    }
  };
  self.onmessage = (event: MessageEvent<BpcQueryRequest>) => {
    const request = event.data;
    if (request.kind !== 'query') {
      loadBpcQueryData(state, request);
      return;
    }
    acceptBpcPrepareInput(state, request);
    if (waiting !== null) self.postMessage({ id: waiting.id, superseded: true });
    else setTimeout(run, 0);
    waiting = request;
  };
}
