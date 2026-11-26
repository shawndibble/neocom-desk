import {
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  type MirrorExtraction,
} from './corpTaxBookEngine.js';
import { READ_MODELS_SCHEMA } from './corpTaxBookVersionKeys.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';

export const READ_MODELS = 'readModels';
export const OVERVIEW_DOC = 'overview';
export { READ_MODELS_SCHEMA };

type Data = Record<string, unknown>;

export interface OverviewDoc {
  schema: number;
  extractions: Data[];
}

export interface ReadModels {
  [OVERVIEW_DOC]: OverviewDoc;
}

export interface ReadModelInputs {
  expiryHours: Readonly<Record<string, number>>;
  extractions: readonly Data[];
}

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

export function buildReadModels(inputs: ReadModelInputs, now: number): ReadModels {
  const extractions = (inputs.extractions as unknown as MirrorExtraction[]).filter((x) =>
    inWindow(x, inputs.expiryHours, now)
  );
  return {
    [OVERVIEW_DOC]: { schema: READ_MODELS_SCHEMA, extractions: extractions as unknown as Data[] },
  };
}

const READ_MODEL_EDITS: ReadonlySet<string> = new Set(['linkSurvey', 'setFullyMined']);

export function movesReadModels(action: { action: string; patch?: object }): boolean {
  if (READ_MODEL_EDITS.has(action.action)) return true;
  const patch = (action.action === 'updateSettings' ? action.patch : undefined) as Data | undefined;
  return patch?.structureExpiryHours !== undefined;
}

export function plainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

export function planReadModels(
  fresh: ReadModels,
  existing: ReadonlyMap<string, Data>
): ReadModelsPlan {
  const id = OVERVIEW_DOC;
  const want = plainData(fresh[id]) as unknown as Data;
  const held = existing.get(id);
  const same =
    held !== undefined &&
    Object.entries(want).every(([k, v]) => canonical(held[k]) === canonical(v));
  if (same) return { writes: [], mismatches: [] };
  return {
    writes: [{ id, data: want }],
    mismatches: [{ id, kind: held === undefined ? 'missing' : 'stale' }],
  };
}
