/**
 * The pure side of the Vetting data page (#6341): which kept row a flag points at, the one kind
 * filter each source has, search, and corporation-history tenure. The rows are the wire's
 * `VettingRawRow`s; names ride beside them and are resolved here, once, when a source loads.
 */
import type {
  VettingCheckId,
  VettingFlag,
  VettingParty,
  VettingRawRow,
  VettingRawSource,
  VettingSeverity,
} from '@/engine/vetting';

/** Cynosural Field Theory: the skill `assessVetting`'s `cynoNoCapital` reads. */
export const CYNO_SKILL_ID = 21603;

/** The sources that carry a date a range can filter on. History's dates are columns. */
export const RAW_DATED: Record<VettingRawSource, boolean> = {
  wallet: true,
  contact: false,
  mail: true,
  contract: true,
  skills: false,
  history: false,
};

export interface RawFilters {
  query: string;
  /** The source's one kind filter; '' for all. */
  kind: string;
  from: string | null;
  to: string | null;
  flagged: boolean;
}

export const NO_RAW_FILTERS: RawFilters = {
  query: '',
  kind: '',
  from: null,
  to: null,
  flagged: false,
};

export interface RawFlagRef {
  check: VettingCheckId;
  severity: VettingSeverity;
}

/** A row ready to draw, filter and sort: its flag, kind and lower-cased search text worked out once. */
export interface RawItem {
  key: string;
  row: VettingRawRow;
  /** The value of the source's kind filter. */
  kind: string;
  flag: RawFlagRef | null;
  hay: string;
}

export interface RawContext {
  parties: ReadonlyMap<number, VettingParty>;
  flags: readonly VettingFlag[];
  /** Skill name and group by type id; empty until the catalog loads. */
  skills: ReadonlyMap<number, { name: string; group: string }>;
  /** The words a journal or contract type reads as. */
  whatLabel: (what: string) => string;
}

export type StandingBucket = 'hostile' | 'neutral' | 'friendly';

export function standingBucket(standing: number | undefined): StandingBucket | '' {
  if (standing === undefined) return '';
  return standing < 0 ? 'hostile' : standing === 0 ? 'neutral' : 'friendly';
}

/** Contract types, as `evidenceWhatKey` knows them: the other rows of a mixed flag are wallet. */
const CONTRACT_WHATS: ReadonlySet<string> = new Set(['item_exchange', 'courier', 'auction']);

const evidenceKey = (
  characterId: number,
  at: string | null,
  partyId: number | undefined,
  what: string,
  amount: number | undefined
) => `${characterId}|${at ?? ''}|${partyId ?? ''}|${what}|${amount ?? ''}`;

/**
 * The flag whose evidence a wallet or contract row is, matched on character, time, party, type
 * and amount; and the Cyno skill row of the flag's characters. First flag wins.
 */
function flagFinder(flags: readonly VettingFlag[]) {
  const byEvidence = new Map<string, RawFlagRef>();
  for (const flag of flags) {
    for (const entry of flag.evidence) {
      const key = evidenceKey(entry.characterId, entry.at, entry.partyId, entry.what, entry.amount);
      if (!byEvidence.has(key)) byEvidence.set(key, { check: flag.check, severity: flag.severity });
    }
  }
  const cyno = flags.find((flag) => flag.check === 'cynoNoCapital');
  return (source: VettingRawSource, row: VettingRawRow): RawFlagRef | null => {
    if (source === 'wallet' || source === 'contract') {
      return (
        byEvidence.get(evidenceKey(row.characterId, row.at, row.partyId, row.what, row.amount)) ??
        null
      );
    }
    if (
      source === 'skills' &&
      cyno &&
      row.skillId === CYNO_SKILL_ID &&
      cyno.characterIds.includes(row.characterId)
    ) {
      return { check: cyno.check, severity: cyno.severity };
    }
    return null;
  };
}

function kindOf(source: VettingRawSource, row: VettingRawRow, ctx: RawContext): string {
  switch (source) {
    case 'wallet':
    case 'contract':
    case 'mail':
      return row.what;
    case 'contact':
      return standingBucket(row.standing);
    case 'skills':
      return (row.skillId !== undefined && ctx.skills.get(row.skillId)?.group) || '';
    default:
      return '';
  }
}

export function prepareRawItems(
  source: VettingRawSource,
  rows: readonly VettingRawRow[],
  ctx: RawContext
): RawItem[] {
  const find = flagFinder(ctx.flags);
  const name = (id: number | undefined) =>
    id === undefined ? undefined : ctx.parties.get(id)?.name;
  return rows.map((row, index) => {
    const party = row.partyId === undefined ? undefined : ctx.parties.get(row.partyId);
    const skill = row.skillId === undefined ? undefined : ctx.skills.get(row.skillId);
    const hay = [
      row.what === '' ? undefined : ctx.whatLabel(row.what),
      party?.name,
      ...(row.recipients ?? []).map(name),
      name(row.corporationId),
      row.status,
      skill?.name,
      skill?.group,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return {
      key: String(index),
      row,
      kind: kindOf(source, row, ctx),
      flag: find(source, row),
      hay,
    };
  });
}

export function filterRawItems(items: readonly RawItem[], filters: RawFilters): RawItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.flagged && item.flag === null) return false;
    if (filters.kind !== '' && item.kind !== filters.kind) return false;
    if (filters.from !== null || filters.to !== null) {
      // An undated row is in no range.
      if (item.row.at === null) return false;
      const day = item.row.at.slice(0, 10);
      if (filters.from !== null && day < filters.from) return false;
      if (filters.to !== null && day > filters.to) return false;
    }
    return query === '' || item.hay.includes(query);
  });
}

/** The distinct kinds in a source's rows, for its one kind filter. */
export function rawKindOptions(items: readonly RawItem[]): string[] {
  return [...new Set(items.map((item) => item.kind).filter((kind) => kind !== ''))].sort();
}

/** Seconds in a corporation: to the day the read ran while the character is still there. */
export function tenureSeconds(row: VettingRawRow, readAt: number): number {
  if (row.joined === undefined) return 0;
  const end = row.left ? Date.parse(row.left) : readAt;
  const seconds = (end - Date.parse(row.joined)) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/** A time the server sent, or null when it is not a date: a malformed row must not throw in a format call. */
export function validTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Where a flag's rows are in the data, for the link inside its "rows behind this": the source,
 * and how many of the flag's own (capped) evidence rows are in it, which is how many the data
 * page tints. Count is null for the Cyno skill, one row of Skills. Null for a flag whose rows
 * are not a source's rows (a count of corporations, a thin character).
 */
export function flagDataTarget(
  flag: VettingFlag
): { source: VettingRawSource; count: number | null } | null {
  const inContracts = (flag: VettingFlag) =>
    flag.evidence.filter((entry) => CONTRACT_WHATS.has(entry.what)).length;
  switch (flag.check) {
    case 'watchlistIsk':
      return { source: 'wallet', count: flag.evidence.length };
    case 'watchlistContracts':
      return { source: 'contract', count: flag.evidence.length };
    case 'undeclaredCharacter': {
      const contracts = inContracts(flag);
      const wallet = flag.evidence.length - contracts;
      return contracts > wallet
        ? { source: 'contract', count: contracts }
        : { source: 'wallet', count: wallet };
    }
    case 'cynoNoCapital':
      return { source: 'skills', count: null };
    default:
      return null;
  }
}
