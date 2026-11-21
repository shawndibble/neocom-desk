// The Overview tab's read model (issue #5259, ADR 0032): `corps/{id}/readModels/overview`, the
// rolling window of Extractions the Overview and Extractions tabs read, falling back to the
// Extractions themselves while it is missing. It holds inputs, never time-derived figures: each
// pull's state is computed on read. The Miners list doc it once sat beside is retired: nothing
// reads it, so the nightly pass deletes it.
//
// Pure and dependency-free.

import {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  type MirrorExtraction,
} from './corpTaxBookEngine.js';
import { READ_MODELS_SCHEMA } from './corpTaxBookVersionKeys.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';

export const READ_MODELS = 'readModels';
/** Retired: deleted wherever it is still held. */
export const MINER_LIST_DOC = 'minerList';
export const OVERVIEW_DOC = 'overview';
export { READ_MODELS_SCHEMA };

type Data = Record<string, unknown>;

export interface OverviewDoc {
  schema: number;
  /**
   * The rolling window of Extractions: those not cancelled and not expired more than a day
   * before the doc was built. State is computed on read.
   */
  extractions: Data[];
}

export interface ReadModels {
  [OVERVIEW_DOC]: OverviewDoc;
}

/** What the doc is built from: the recent Extractions and each refinery's expiry. */
export interface ReadModelInputs {
  expiryHours: Readonly<Record<string, number>>;
  extractions: readonly Data[];
}

/** Whether an Extraction is still worth listing at `now` (ms): not cancelled, expiry no more than a day gone. */
function inWindow(
  x: MirrorExtraction,
  expiryHours: Readonly<Record<string, number>>,
  now: number
): boolean {
  if (x.cancelledAt) return false;
  const fractured = Date.parse(x.laserFiredAt ?? x.naturalDecayTime);
  if (Number.isNaN(fractured)) return true;
  const hours = Math.min(
    expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
    MAX_EXPIRY_HOURS
  );
  return fractured + hours * HOUR_MS >= now - DAY_MS;
}

/** Builds the doc. `now` is epoch ms. */
export function buildReadModels(inputs: ReadModelInputs, now: number): ReadModels {
  const extractions = (inputs.extractions as unknown as MirrorExtraction[]).filter((x) =>
    inWindow(x, inputs.expiryHours, now)
  );
  return {
    [OVERVIEW_DOC]: { schema: READ_MODELS_SCHEMA, extractions: extractions as unknown as Data[] },
  };
}

/** Edits that change an Extraction the doc lists. */
const READ_MODEL_EDITS: ReadonlySet<string> = new Set(['linkSurvey', 'setFullyMined']);

/** Whether an edit moves the Overview doc: an Extraction, or a refinery's expiry. */
export function movesReadModels(action: { action: string; patch?: object }): boolean {
  if (READ_MODEL_EDITS.has(action.action)) return true;
  const patch = (action.action === 'updateSettings' ? action.patch : undefined) as Data | undefined;
  return patch?.structureExpiryHours !== undefined;
}

/** Drops `undefined`, which Firestore refuses. */
export function plainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** JSON with sorted keys: Firestore hands fields back in its own order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export interface ReadModelsPlan {
  writes: { id: string; data: Data }[];
  /** Retired docs still held. */
  deletes: string[];
  mismatches: { id: string; kind: 'missing' | 'stale' | 'retired' }[];
}

/** Which docs differ from what `fresh` says they should be (`updatedAt` and unknown fields ignored). */
export function planReadModels(
  fresh: ReadModels,
  existing: ReadonlyMap<string, Data>
): ReadModelsPlan {
  const plan: ReadModelsPlan = { writes: [], deletes: [], mismatches: [] };
  const want = plainData(fresh[OVERVIEW_DOC]) as unknown as Data;
  const held = existing.get(OVERVIEW_DOC);
  const same =
    held !== undefined &&
    Object.entries(want).every(([k, v]) => canonical(held[k]) === canonical(v));
  if (!same) {
    plan.writes.push({ id: OVERVIEW_DOC, data: want });
    plan.mismatches.push({ id: OVERVIEW_DOC, kind: held === undefined ? 'missing' : 'stale' });
  }
  if (existing.has(MINER_LIST_DOC)) {
    plan.deletes.push(MINER_LIST_DOC);
    plan.mismatches.push({ id: MINER_LIST_DOC, kind: 'retired' });
  }
  return plan;
}
