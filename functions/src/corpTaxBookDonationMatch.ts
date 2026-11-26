import { isLocked } from './corpTaxBookCheckpoint.js';
import { minerPaymentCode, paymentCode } from './corpTaxBookLateNotice.js';

export interface MatchMiner {
  id: string;
  characterIds: readonly number[];
  aliases?: readonly string[];
  createdAt?: string;
  closedAt?: string | null;
  leftOn?: Readonly<Record<number, string>>;
}

const isClosed = (minerId: string, miners: readonly MatchMiner[]): boolean =>
  miners.some((m) => m.id === minerId && m.closedAt != null);

export const earlierGrouping = (
  a: Pick<MatchMiner, 'id' | 'createdAt'>,
  b: Pick<MatchMiner, 'id' | 'createdAt'>
): number => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);

const CODE_TOKEN = /(?<![0-9A-Za-z])MT[0-9A-Z]{6}(?![0-9A-Za-z])/gi;

export function codesIn(reason: string | undefined): string[] {
  return [...new Set((reason ?? '').match(CODE_TOKEN)?.map((c) => c.toUpperCase()) ?? [])];
}

export const soloMinerId = (characterId: number): string => `solo:${characterId}`;

export function soloCharacterId(minerId: string): number | undefined {
  const solo = /^solo:(\d+)$/.exec(minerId);
  return solo ? Number(solo[1]) : undefined;
}

const groupingHolds = (
  m: Pick<MatchMiner, 'characterIds' | 'leftOn'>,
  characterId: number,
  date?: string
): boolean => {
  const left = m.leftOn?.[characterId];
  return date !== undefined && left !== undefined
    ? date < left
    : m.characterIds.includes(characterId);
};

export function minerIdFor(
  characterId: number,
  miners: readonly Pick<MatchMiner, 'id' | 'characterIds' | 'createdAt' | 'leftOn'>[],
  date?: string
): string {
  let best: Pick<MatchMiner, 'id' | 'createdAt'> | undefined;
  for (const m of miners) {
    if (groupingHolds(m, characterId, date) && (!best || earlierGrouping(m, best) < 0)) best = m;
  }
  return best?.id ?? soloMinerId(characterId);
}

export function currentMinerOf(minerId: string, miners: readonly MatchMiner[]): string {
  if (miners.some((m) => m.id === minerId)) return minerId;
  const folded = miners.find((m) => m.aliases?.includes(minerId));
  if (folded) return folded.id;
  const character = soloCharacterId(minerId);
  return character !== undefined ? minerIdFor(character, miners) : minerId;
}

export type CodeOwners = ReadonlyMap<string, readonly string[]>;

export function codeOwners(
  notices: readonly { id: string; minerId: string; code?: string }[],
  miners: readonly MatchMiner[],
  knownMinerIds: Iterable<string>
): CodeOwners {
  const owners = new Map<string, string[]>();
  const add = (code: string, minerId: string) => {
    const owner = currentMinerOf(minerId, miners);
    const held = owners.get(code) ?? [];
    if (!held.includes(owner)) owners.set(code, [...held, owner].sort());
  };
  for (const n of notices) add((n.code ?? paymentCode(n.id)).toUpperCase(), n.minerId);
  const ids = new Set<string>(knownMinerIds);
  for (const m of miners) {
    ids.add(m.id);
    for (const a of m.aliases ?? []) ids.add(a);
    for (const c of m.characterIds) ids.add(soloMinerId(c));
  }
  for (const id of ids) add(minerPaymentCode(id), id);
  return owners;
}

export interface MatchBook {
  miners: readonly MatchMiner[];
  codes: CodeOwners;
  minedCharacterIds: ReadonlySet<number>;
  paidBefore?: ReadonlyMap<number, readonly string[]>;
}

export type DonationOwner =
  | { kind: 'miner'; minerId: string; by: 'sender' | 'code' | 'payer' }
  | { kind: 'ambiguous'; minerIds: string[] }
  | { kind: 'unmatched' };

function ownerOfNamed(named: ReadonlySet<string>, by: 'code' | 'payer'): DonationOwner | undefined {
  const ids = [...named].sort();
  if (ids.length === 0) return undefined;
  return ids.length === 1
    ? { kind: 'miner', minerId: ids[0], by }
    : { kind: 'ambiguous', minerIds: ids };
}

export function donationOwner(
  donation: { characterId: number; reason?: string; at?: string },
  book: MatchBook
): DonationOwner {
  const day = donation.at?.slice(0, 10);
  const grouped = book.miners.some((m) => groupingHolds(m, donation.characterId, day));
  if (grouped || book.minedCharacterIds.has(donation.characterId))
    return {
      kind: 'miner',
      minerId: minerIdFor(donation.characterId, book.miners, day),
      by: 'sender',
    };
  const coded = new Set(codesIn(donation.reason).flatMap((code) => book.codes.get(code) ?? []));
  const payer = new Set(
    (book.paidBefore?.get(donation.characterId) ?? []).map((id) => currentMinerOf(id, book.miners))
  );
  return ownerOfNamed(coded, 'code') ?? ownerOfNamed(payer, 'payer') ?? { kind: 'unmatched' };
}

export type ResolvedOwner =
  | { minerId: string }
  | { reviewReason: 'ambiguous'; ambiguousMinerIds: string[] }
  | { reviewReason: 'account-closed' }
  | Record<string, never>;

export function matchBookOf(input: {
  miners: readonly MatchMiner[];
  notices: readonly { id: string; minerId: string; code?: string }[];
  minedCharacterIds: Iterable<number>;
  recordedMinerIds?: Iterable<string>;
  paidBefore?: ReadonlyMap<number, readonly string[]>;
}): MatchBook {
  const mined = new Set(input.minedCharacterIds);
  return {
    miners: input.miners,
    codes: codeOwners(input.notices, input.miners, [
      ...(input.recordedMinerIds ?? []),
      ...[...mined].map((c) => minerIdFor(c, input.miners)),
    ]),
    minedCharacterIds: mined,
    ...(input.paidBefore ? { paidBefore: input.paidBefore } : {}),
  };
}

export interface UnmatchedCandidate {
  id: string;
  characterId?: number;
  reason?: string;
  minerId?: string;
  at: string;
  notTaxAmount?: number;
  reviewReason?: string;
}

export function rematchUnmatched(
  payments: readonly UnmatchedCandidate[],
  book: MatchBook,
  today: string
): { paymentId: string; minerId: string }[] {
  return [...payments]
    .filter(
      (p) =>
        p.minerId === undefined &&
        typeof p.characterId === 'number' &&
        !(p.notTaxAmount && p.notTaxAmount > 0) &&
        p.reviewReason !== 'ambiguous' &&
        !isLocked(p.at, today)
    )
    .sort((a, b) => a.at.localeCompare(b.at))
    .flatMap((p) => {
      const owner = donationOwner(
        { characterId: p.characterId!, reason: p.reason, at: p.at },
        book
      );
      return owner.kind === 'miner' && !isClosed(owner.minerId, book.miners)
        ? [{ paymentId: p.id, minerId: owner.minerId }]
        : [];
    });
}

export function ownerFields(
  donation: { characterId: number; reason?: string; at?: string },
  book: MatchBook
): ResolvedOwner {
  const owner = donationOwner(donation, book);
  if (owner.kind === 'miner')
    return isClosed(owner.minerId, book.miners)
      ? { reviewReason: 'account-closed' }
      : { minerId: owner.minerId };
  if (owner.kind === 'ambiguous')
    return { reviewReason: 'ambiguous', ambiguousMinerIds: owner.minerIds };
  return {};
}

export const UNCOUNTED_LIMIT = 20;

export interface UncountedDonation {
  id: string;
  refId: number;
  division: number;
  characterId: number;
  amount: number;
  at: string;
}

type ElsewhereDonation = {
  refId: number;
  division: number;
  characterId: number;
  amount: number;
  at: string;
  reason?: string;
};

export function noteUncountedDonations(
  donations: readonly ElsewhereDonation[],
  book: MatchBook,
  mined: ReadonlySet<string>
): UncountedDonation[] {
  return donations
    .filter((d) => {
      const owner = donationOwner(d, book);
      if (owner.kind === 'ambiguous' || (owner.kind === 'miner' && owner.by === 'code'))
        return true;
      return owner.kind === 'miner' && mined.has(owner.minerId);
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.refId - a.refId)
    .slice(0, UNCOUNTED_LIMIT)
    .map((d) => ({
      id: `j${d.division}_${d.refId}`,
      refId: d.refId,
      division: d.division,
      characterId: d.characterId,
      amount: d.amount,
      at: d.at,
    }));
}
