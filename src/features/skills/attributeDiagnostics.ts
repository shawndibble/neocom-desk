import { BASE_ATTRIBUTE_TOTAL, type AttributeBaseline } from '@/engine/attributeBaseline';
import { ATTRIBUTE_NAMES as NAMES } from '@/engine/optimizer';
import type { Implants } from '@/engine/types';
import type { CharacterAttributes } from '@/esi/endpoints';

export interface AttributeDiagnosticsInput {
  attributes: CharacterAttributes;
  implants: Implants;
  baseline: AttributeBaseline;
  /** When the sheet was fetched, as the cache recorded it. */
  fetchedAt?: Date | null;
  fromCache?: boolean;
}

/**
 * A plain-text account of why a sheet was read the way it was, for a pilot to
 * paste into a bug report: what ESI said, what was subtracted, and what is
 * left per attribute. Numbers only — no tokens, no character id or name.
 * English labels on purpose: it is a bug-report payload read by a developer,
 * not UI copy.
 */
export function attributeDiagnostics(input: AttributeDiagnosticsInput): string {
  const { attributes, implants, baseline } = input;
  const reported = NAMES.map((name) => attributes[name]);
  const worn = NAMES.map((name) => implants[name] ?? 0);
  const afterImplants = reported.map((value, i) => value - worn[i]);
  const total = afterImplants.reduce((sum, value) => sum + value, 0);
  const excess = total - BASE_ATTRIBUTE_TOTAL;
  const row = (label: string, values: readonly number[]) =>
    `${label.padEnd(18)}${values.map((value) => String(value).padStart(4)).join('')}`;
  return [
    'Neocom Desk attribute diagnostics',
    `Verdict: ${baseline.kind}`,
    `${''.padEnd(18)}${['INT', 'MEM', 'PER', 'WIL', 'CHA'].map((n) => n.padStart(4)).join('')}`,
    row('ESI reported', reported),
    row('Implants', worn),
    row('After implants', afterImplants),
    `After-implant total: ${total} (a legal base totals ${BASE_ATTRIBUTE_TOTAL}; excess ${excess}, ${excess / NAMES.length} per attribute)`,
    `Fetched: ${input.fetchedAt ? input.fetchedAt.toISOString() : 'unknown'}${input.fromCache ? ' (from cache)' : ''}`,
  ].join('\n');
}
