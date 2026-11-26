import type { SecurityBand } from '@/engine/industry/types';

export interface RememberedLocationFields {
  security?: SecurityBand;
  buildSystemId?: number;
  buildSystemName?: string;
  buildLocationId?: number;
  buildLocationName?: string;
  setOnPlanPage?: true;
}

const SECURITY_BANDS: readonly SecurityBand[] = ['highsec', 'lowsec', 'nullsec'];

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

export function parseRememberedLocation(raw: Record<string, unknown>): RememberedLocationFields {
  const fields: RememberedLocationFields = {};
  if (SECURITY_BANDS.includes(raw.security as SecurityBand)) {
    fields.security = raw.security as SecurityBand;
  }
  if (isId(raw.buildSystemId) && isName(raw.buildSystemName)) {
    fields.buildSystemId = raw.buildSystemId;
    fields.buildSystemName = raw.buildSystemName;
  }
  if (isId(raw.buildLocationId)) {
    fields.buildLocationId = raw.buildLocationId;
    if (isName(raw.buildLocationName)) fields.buildLocationName = raw.buildLocationName;
  }
  if (raw.setOnPlanPage === true) fields.setOnPlanPage = true;
  return fields;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export function sameRememberedRecord(a: object, b: object): boolean {
  return stableJson(a) === stableJson(b);
}
