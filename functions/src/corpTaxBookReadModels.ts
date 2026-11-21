// The tab read models (issue #5259, ADR 0032), under `corps/{id}/readModels`:
// - `overview`: the rolling window of Extractions the Overview and Extractions tabs read, falling
//   back to the Extractions themselves while it is missing. Each pull's state is computed on read.
// - `minerList`: the id of every Miner an officer's visit recorded an account for
//   (`accounts/{minerId}`), so a page read for one Miner can offer the others (the Move dialog
//   lists the solo ones from it). Its figures live in the accounts, never here.
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

export interface MinerListDoc {
  schema: number;
  /** Every Miner with a recorded account, by id, sorted. */
  miners: { minerId: string }[];
}

export interface ReadModels {
  [OVERVIEW_DOC]: OverviewDoc;
  [MINER_LIST_DOC]: MinerListDoc;
}

/** What the docs are built from: the recent Extractions, each refinery's expiry, the accounts' ids. */
export interface ReadModelInputs {
  expiryHours: Readonly<Record<string, number>>;
  extractions: readonly Data[];
  /** `accounts/{minerId}` doc ids; absent reads as none. */
  accountIds?: readonly string[];
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
    [MINER_LIST_DOC]: {
      schema: READ_MODELS_SCHEMA,
      miners: [...new Set(inputs.accountIds ?? [])].sort().map((minerId) => ({ minerId })),
    },
  };
}

/** Edits that change an Extraction the Overview lists, or which Miners have a recorded account. */
const READ_MODEL_EDITS: ReadonlySet<string> = new Set([
  'linkSurvey',
  'setFullyMined',
  'recordAccounts',
  'setMiner',
  'regroupMiner',
]);

/** Whether an edit moves a read model: an Extraction, a refinery's expiry, or a recorded account. */
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
  mismatches: { id: string; kind: 'missing' | 'stale' }[];
}

/** Which docs differ from what `fresh` says they should be (`updatedAt` and unknown fields ignored). */
export function planReadModels(
  fresh: ReadModels,
  existing: ReadonlyMap<string, Data>
): ReadModelsPlan {
  const plan: ReadModelsPlan = { writes: [], mismatches: [] };
  for (const id of [OVERVIEW_DOC, MINER_LIST_DOC] as const) {
    const want = plainData(fresh[id]) as unknown as Data;
    const held = existing.get(id);
    const same =
      held !== undefined &&
      Object.entries(want).every(([k, v]) => canonical(held[k]) === canonical(v));
    if (same) continue;
    plan.writes.push({ id, data: want });
    plan.mismatches.push({ id, kind: held === undefined ? 'missing' : 'stale' });
  }
  return plan;
}
