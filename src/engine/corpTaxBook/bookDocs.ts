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

export type TaxContact =
  { kind: 'mailingList'; id: number; name: string } | { kind: 'characters'; ids: number[] };

export const TAX_CONTACT_MAX_CHARACTERS = 5;

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

export interface BookSettings {
  active: boolean;
  startDate: string;
  divisions: number[];
  primaryDivision?: number;
  divisionNames?: DivisionNames;
  lastSync: LastSync | null;
  structureExpiryHours: Record<string, number>;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  graceHours: number;
  overdueDays: number;
  chunkM3PerHour: number | null;
  rates: TaxRate[];
  dismissApprovalAboveIsk: number | null;
  ownerCharacterId: number | null;
  createdBy: number | null;
  membersSeeFrom?: number;
  taxContact?: TaxContact;
  noticeRules: NoticeRules;
  dayTolerancePct: number;
}

export const RATE_SCOPES: ReadonlySet<RateScope> = new Set(SCOPE_ORDER);

export const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const TARGET: Partial<Record<RateScope, [field: string, kind: 'number' | 'string']>> = {
  feeder: ['feederId', 'number'],
  'feeder-member': ['feederId', 'number'],
  miner: ['minerId', 'string'],
  moon: ['moonId', 'number'],
  structure: ['structureId', 'number'],
  record: ['recordKey', 'string'],
};

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

export function parseBookSettings(d: Data): BookSettings {
  const expiry = isRecord(d.structureExpiryHours) ? d.structureExpiryHours : {};
  const membersSeeFrom = num(d.membersSeeFrom);
  const taxContact = parseTaxContact(d.taxContact);
  const primaryDivision = num(d.primaryDivision);
  return {
    active: d.active === true,
    startDate: str(d.startDate) ?? '',
    divisions: Array.isArray(d.divisions)
      ? d.divisions.filter((x): x is number => num(x) !== undefined)
      : [1],
    ...(primaryDivision !== undefined ? { primaryDivision } : {}),
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
