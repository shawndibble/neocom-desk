/**
 * The Corp Tax Book's stored documents read back in one place: the book's settings doc
 * (`corps/{id}`) and its rates, for the officer's client and the member's alike, and the one
 * rule for which corporation a character was last recorded in. Pure: callers fetch, this parses.
 * The functions copy of `latestRecordedCorp` lives in `functions/src/corpTaxBookEngine.ts`
 * (ADR 0025: functions cannot import src), kept honest by `functionsMirror.test.ts`.
 */
import { DEFAULT_GRACE_HOURS } from './billable';
import { readDivisionNames, type DivisionNames } from './divisionNames';
import { recordedLater, type CorpRecord } from './observed';
import { DEFAULT_OVERDUE_DAYS } from './overdue';
import { SCOPE_ORDER, type RateScope, type TaxRate } from './rates';
import { DEFAULT_MINIMUM_STATEMENT, type StatementCadence } from './statements';
import type { LastSync } from './sync';

type Data = Record<string, unknown>;

/** Every setting the book document stores, every default filled in. */
export interface BookSettings {
  active: boolean;
  /** Empty when the doc has none. */
  startDate: string;
  divisions: number[];
  /** The corp's own names for those divisions (#6161); `parseBookSettings` always fills it. */
  divisionNames?: DivisionNames;
  lastSync: LastSync | null;
  structureExpiryHours: Record<string, number>;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  graceHours: number;
  minimumStatement: number;
  overdueDays: number;
  cadence: StatementCadence;
  chunkM3PerHour: number | null;
  rates: TaxRate[];
  /** Above this a dismissal needs a Director (D6); null when there is no limit. */
  dismissApprovalAboveIsk: number | null;
  ownerCharacterId: number | null;
  /** Who turned the book on; the owner changes when the CEO reclaims it. */
  createdBy: number | null;
  /** Epoch ms: until then members' own Mining Tax pages ignore the book (setup window). */
  membersSeeFrom?: number;
}

/** Every scope a stored rate can have — the engine's own list, so a new scope is never dropped. */
export const RATE_SCOPES: ReadonlySet<RateScope> = new Set(SCOPE_ORDER);

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const isObject = (v: unknown): v is Data => typeof v === 'object' && v !== null;

/** The field naming what a scoped rate targets, and whether it is a number or a string. */
const TARGET: Partial<Record<RateScope, [field: string, kind: 'number' | 'string']>> = {
  feeder: ['feederId', 'number'],
  'feeder-member': ['feederId', 'number'],
  miner: ['minerId', 'string'],
  moon: ['moonId', 'number'],
  structure: ['structureId', 'number'],
  record: ['recordKey', 'string'],
};

/** One stored rate, or null when it is not one the engine can resolve. */
export function parseRate(v: unknown): TaxRate | null {
  if (!isObject(v) || num(v.pct) === undefined) return null;
  const scope = v.scope as RateScope;
  if (!RATE_SCOPES.has(scope)) return null;
  if (scope !== 'record' && str(v.effectiveFrom) === undefined) return null;
  const target = TARGET[scope];
  if (target) {
    const [field, kind] = target;
    if ((kind === 'number' ? num(v[field]) : str(v[field])) === undefined) return null;
  }
  return v as unknown as TaxRate;
}

function parseCadence(v: unknown): StatementCadence {
  if (isObject(v) && v.kind === 'days') {
    const days = num(v.days);
    const anchor = str(v.anchor);
    if (days !== undefined && anchor !== undefined) return { kind: 'days', days, anchor };
  }
  return { kind: 'monthly' };
}

/**
 * The settings doc as `BookSettings`, validated, with the engine's defaults for anything absent
 * or malformed. Whether a member may see the book yet (active, setup window) is the caller's.
 */
export function parseBookSettings(d: Data): BookSettings {
  const expiry = isObject(d.structureExpiryHours) ? d.structureExpiryHours : {};
  const membersSeeFrom = num(d.membersSeeFrom);
  return {
    active: d.active === true,
    startDate: str(d.startDate) ?? '',
    divisions: Array.isArray(d.divisions)
      ? d.divisions.filter((x): x is number => num(x) !== undefined)
      : [1],
    divisionNames: readDivisionNames(d.divisionNames),
    lastSync: isObject(d.lastSync) ? (d.lastSync as unknown as LastSync) : null,
    structureExpiryHours: Object.fromEntries(
      Object.entries(expiry).filter((e): e is [string, number] => num(e[1]) !== undefined)
    ),
    hubId: str(d.hubId) ?? 'jita',
    oreForm: d.oreForm === 'raw' ? 'raw' : 'compressed',
    graceHours: num(d.graceHours) ?? DEFAULT_GRACE_HOURS,
    minimumStatement: num(d.minimumStatement) ?? DEFAULT_MINIMUM_STATEMENT,
    overdueDays: num(d.overdueDays) ?? DEFAULT_OVERDUE_DAYS,
    cadence: parseCadence(d.cadence),
    chunkM3PerHour: num(d.chunkM3PerHour) ?? null,
    rates: (Array.isArray(d.rates) ? d.rates : []).flatMap((r) => parseRate(r) ?? []),
    dismissApprovalAboveIsk: num(d.dismissApprovalAboveIsk) ?? null,
    ownerCharacterId: num(d.ownerCharacterId) ?? null,
    createdBy: num(d.createdBy) ?? null,
    ...(membersSeeFrom !== undefined ? { membersSeeFrom } : {}),
  };
}

/**
 * Each character's latest recorded corporation — the one the player's standing (member, left,
 * guest) and the Close account guard go by. Of a character's ledger rows (or Observed Mining
 * Entries, which carry their freshest read), the one `recordedLater` ranks first: the newest
 * day, then the freshest ESI read, then the higher refinery id, then the higher corporation
 * id. So a character who mined as a member and then as a guest on the same day reads as a
 * guest once a later read saw them as one, and every reader agrees whatever its row order.
 * Mirrored by hand in `functions/src/corpTaxBookEngine.ts`.
 */
export function latestRecordedCorp(
  rows: readonly (CorpRecord & { characterId: number })[]
): Map<number, { date: string; corp: number }> {
  const best = new Map<number, CorpRecord>();
  for (const row of rows) {
    const held = best.get(row.characterId);
    if (!held || recordedLater(row, held)) best.set(row.characterId, row);
  }
  return new Map(
    [...best].map(([id, row]) => [id, { date: row.date, corp: row.recordedCorporationId }])
  );
}
