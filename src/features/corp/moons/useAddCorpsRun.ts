/**
 * The persisted "Add my other corps" run. EVE's login leaves the page between
 * corporations and the player may close the tab, so the run lives in a
 * device-local Dexie setting. Outcomes stay after the run ends: Needs sign-in,
 * Needs a role and Has its own book leave no server record.
 */
import { useCallback } from 'react';
import { createLocalSetting } from '@/lib/useLocalSetting';
import {
  recordOutcome as recordRunOutcome,
  retry as retryRun,
  skip as skipRun,
  startRun,
  stop as stopRun,
  type AddCorpsOutcome,
  type AddCorpsRun,
} from '@/engine/corpTaxBook/addCorpsRun';

export const ADD_CORPS_RUN_KEY = 'moonsAddCorpsRun';

function isOutcome(raw: unknown): raw is AddCorpsOutcome {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as { kind?: unknown; signedInAs?: unknown; reason?: unknown };
  switch (o.kind) {
    case 'connected':
    case 'skipped':
    case 'cancelled':
      return true;
    case 'wrong-character':
      return typeof o.signedInAs === 'string';
    case 'refused':
      return typeof o.reason === 'string';
    default:
      return false;
  }
}

const isId = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** Anything stored, or null when it is not a usable run. */
export function parseAddCorpsRun(raw: unknown): AddCorpsRun | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.collectorCorporationId) || !isId(r.editorCharacterId)) return null;
  if (!Array.isArray(r.queue) || typeof r.index !== 'number') return null;
  const queue: AddCorpsRun['queue'] = [];
  for (const c of r.queue) {
    const q = c as Record<string, unknown> | null;
    if (!q || !isId(q.corporationId) || !isId(q.ceoCharacterId)) return null;
    if (typeof q.name !== 'string' || typeof q.ceoName !== 'string') return null;
    queue.push({
      corporationId: q.corporationId,
      ceoCharacterId: q.ceoCharacterId,
      name: q.name,
      ceoName: q.ceoName,
    });
  }
  const outcomes: AddCorpsRun['outcomes'] = {};
  if (typeof r.outcomes === 'object' && r.outcomes !== null) {
    for (const [id, o] of Object.entries(r.outcomes)) {
      if (isId(Number(id)) && isOutcome(o)) outcomes[Number(id)] = o;
    }
  }
  const last = r.lastOutcome as { corporationId?: unknown; outcome?: unknown } | undefined;
  return {
    collectorCorporationId: r.collectorCorporationId,
    editorCharacterId: r.editorCharacterId,
    ...(typeof r.coverageFrom === 'string' ? { coverageFrom: r.coverageFrom } : {}),
    queue,
    index: Math.min(Math.max(Math.trunc(r.index), 0), queue.length),
    outcomes,
    ...(last && isId(last.corporationId) && isOutcome(last.outcome)
      ? { lastOutcome: { corporationId: last.corporationId, outcome: last.outcome } }
      : {}),
  };
}

export const useAddCorpsRunStore = createLocalSetting<AddCorpsRun | null>({
  key: ADD_CORPS_RUN_KEY,
  defaultValue: null,
  parse: parseAddCorpsRun,
});

export interface UseAddCorpsRun {
  /** `null` when there is no run (never started, or cleared). A finished run is kept until `clear`. */
  run: AddCorpsRun | null;
  start: (args: Parameters<typeof startRun>[0]) => Promise<void>;
  recordOutcome: (outcome: AddCorpsOutcome) => Promise<void>;
  skip: () => Promise<void>;
  /** End the run; its outcomes stay for the result screen. */
  stop: () => Promise<void>;
  /** Put one corporation back on the sign-in list (its outcome is forgotten). */
  retry: (corporationId: number) => Promise<void>;
  /** Forget the run and its outcomes. */
  clear: () => Promise<void>;
}

export function useAddCorpsRun(): UseAddCorpsRun {
  const run = useAddCorpsRunStore((s) => s.value);
  const setValue = useAddCorpsRunStore((s) => s.setValue);
  const update = useCallback(
    async (fn: (r: AddCorpsRun) => AddCorpsRun) => {
      const current = useAddCorpsRunStore.getState().value;
      if (current) await setValue(fn(current));
    },
    [setValue]
  );
  return {
    run,
    start: useCallback((args) => setValue(startRun(args)), [setValue]),
    recordOutcome: useCallback((o) => update((r) => recordRunOutcome(r, o)), [update]),
    skip: useCallback(() => update(skipRun), [update]),
    stop: useCallback(() => update(stopRun), [update]),
    retry: useCallback((id) => update((r) => retryRun(r, id)), [update]),
    clear: useCallback(() => setValue(null), [setValue]),
  };
}
