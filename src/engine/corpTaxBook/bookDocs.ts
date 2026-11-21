/**
 * The Corp Tax Book's stored documents read back in one place: the book's settings doc
 * (`corps/{id}`) and its rates, for the officer's client and the member's alike, and the one
 * rule for which corporation a character was last recorded in. Pure: callers fetch, this parses.
 * The functions copy of `latestRecordedCorp` lives in `functions/src/corpTaxBookEngine.ts`
 * (ADR 0025: functions cannot import src), kept honest by `functionsMirror.test.ts`.
 */
import { isFiniteNumber, isId, isRecord } from '../guards';
import { DEFAULT_GRACE_HOURS } from './billable';
import { readDivisionNames, type DivisionNames } from './divisionNames';
import { recordedLater, type CorpRecord } from './observed';
import { DEFAULT_OVERDUE_DAYS } from './overdue';
import { SCOPE_ORDER, type RateScope, type TaxRate } from './rates';
import type { LastSync } from './sync';
import { parseNoticeRules, type NoticeRules } from './notices';
import { DAY_SETTLE_TOLERANCE_PCT } from './minerRunningAccount';

type Data = Record<string, unknown>;

/** Who gets the EVE mail when a member asks about tax: a mailing list, or up to five characters. */
export type TaxContact =
  { kind: 'mailingList'; id: number; name: string } | { kind: 'characters'; ids: number[] };

/** The most characters a `TaxContact` can name. */
export const TAX_CONTACT_MAX_CHARACTERS = 5;

/** A stored `taxContact`, or undefined when absent or malformed (then the CEO is mailed). */
export function parseTaxContact(v: unknown): TaxContact | undefined {
  if (!isRecord(v)) return undefined;
  if (v.kind === 'mailingList') {
    return isId(v.id) && typeof v.name === 'string'
      ? { kind: 'mailingList', id: v.id, name: v.name }
      : undefined;
  }
  if (v.kind === 'characters' && Array.isArray(v.ids) && v.ids.every(isId)) {
    const ids = [...new Set(v.ids as number[])];
    return ids.length >= 1 && ids.length <= TAX_CONTACT_MAX_CHARACTERS
      ? { kind: 'characters', ids }
      : undefined;
  }
  return undefined;
}

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
  overdueDays: number;
  chunkM3PerHour: number | null;
  rates: TaxRate[];
  /** Above this a dismissal needs a Director (D6); null when there is no limit. */
  dismissApprovalAboveIsk: number | null;
  ownerCharacterId: number | null;
  /** Who turned the book on; the owner changes when the CEO reclaims it. */
  createdBy: number | null;
  /** Epoch ms: until then members' own Mining Tax pages ignore the book (setup window). */
  membersSeeFrom?: number;
  /** Who gets the EVE mail when a member asks about tax. Absent → the corporation's CEO. */
  taxContact?: TaxContact;
  /** A running account's late notices. */
  noticeRules: NoticeRules;
  /** A running account's per-day tolerance, in percent. */
  dayTolerancePct: number;
}

/** Every scope a stored rate can have — the engine's own list, so a new scope is never dropped. */
export const RATE_SCOPES: ReadonlySet<RateScope> = new Set(SCOPE_ORDER);

export const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

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
  if (!isRecord(v) || num(v.pct) === undefined) return null;
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

/**
 * The settings doc as `BookSettings`, validated, with the engine's defaults for anything absent
 * or malformed. Whether a member may see the book yet (active, setup window) is the caller's.
 */
export function parseBookSettings(d: Data): BookSettings {
  const expiry = isRecord(d.structureExpiryHours) ? d.structureExpiryHours : {};
  const membersSeeFrom = num(d.membersSeeFrom);
  const taxContact = parseTaxContact(d.taxContact);
  return {
    active: d.active === true,
    startDate: str(d.startDate) ?? '',
    divisions: Array.isArray(d.divisions)
      ? d.divisions.filter((x): x is number => num(x) !== undefined)
      : [1],
    divisionNames: readDivisionNames(d.divisionNames),
    lastSync: isRecord(d.lastSync) ? (d.lastSync as unknown as LastSync) : null,
    structureExpiryHours: Object.fromEntries(
      Object.entries(expiry).filter((e): e is [string, number] => num(e[1]) !== undefined)
    ),
    hubId: str(d.hubId) ?? 'jita',
    oreForm: d.oreForm === 'raw' ? 'raw' : 'compressed',
    graceHours: num(d.graceHours) ?? DEFAULT_GRACE_HOURS,
    overdueDays: num(d.overdueDays) ?? DEFAULT_OVERDUE_DAYS,
    chunkM3PerHour: num(d.chunkM3PerHour) ?? null,
    rates: (Array.isArray(d.rates) ? d.rates : []).flatMap((r) => parseRate(r) ?? []),
    dismissApprovalAboveIsk: num(d.dismissApprovalAboveIsk) ?? null,
    ownerCharacterId: num(d.ownerCharacterId) ?? null,
    createdBy: num(d.createdBy) ?? null,
    ...(membersSeeFrom !== undefined ? { membersSeeFrom } : {}),
    ...(taxContact ? { taxContact } : {}),
    noticeRules: parseNoticeRules(d.noticeRules),
    dayTolerancePct: num(d.dayTolerancePct) ?? DAY_SETTLE_TOLERANCE_PCT,
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
