export const SYNCED_PI_CUSTOMS_KEY = 'sync.piCustomsRates';

export type CustomsOverrides = Record<number, number>;

const MAX_RATE = 1;

function usableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_RATE;
}

export function parseCustomsOverrides(raw: unknown): CustomsOverrides {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: CustomsOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const systemId = Number(key);
    if (!Number.isInteger(systemId) || systemId <= 0) continue;
    if (!usableRate(value)) continue;
    out[systemId] = value;
  }
  return out;
}

export function customsRateFor(
  systemId: number,
  overrides: CustomsOverrides,
  derived: number
): number {
  const own = overrides[systemId];
  return own === undefined ? derived : own;
}

export function withCustomsOverride(
  overrides: CustomsOverrides,
  systemId: number,
  rate: number
): CustomsOverrides {
  if (!Number.isFinite(rate)) return overrides;
  return { ...overrides, [systemId]: Math.min(MAX_RATE, Math.max(0, rate)) };
}

export function withoutCustomsOverride(
  overrides: CustomsOverrides,
  systemId: number
): CustomsOverrides {
  if (overrides[systemId] === undefined) return overrides;
  const next = { ...overrides };
  delete next[systemId];
  return next;
}
