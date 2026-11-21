// Whose money a donation is (decision 20261120-235011): the one matching rule for the client and
// the Cloud Functions (decision 20261117-230113), dependency-free so both import it.
//
// A sender the book knows (grouped, or seen mining: never "has paid before") pays their own
// Miner, whatever code the reason names. Any other donation is named by the Reason codes it
// carries: each Miner's own code (`minerPaymentCode`, for the Miner, each id folded into it and
// each of its Characters' solo ids) and every code a Late notice printed. With no code, a payer
// known only by an earlier payment keeps the Miner that payment named. A code held by two Miners,
// a reason naming two, or a payer whose payments named two, is ambiguous: it goes to an officer's
// review and is never claimed automatically. A code only says whose money it is; it pays that
// Miner's oldest day.

import { minerPaymentCode, paymentCode } from './corpTaxBookLateNotice.js';

/** A Miner grouping, with the ids folded into it (`aliases`) and when it was first made. */
export interface MatchMiner {
  id: string;
  characterIds: readonly number[];
  aliases?: readonly string[];
  createdAt?: string;
}

/**
 * The order groupings are ranked in when a Character is stored in more than one: the earliest
 * made wins (one made before `createdAt` existed counts as earliest), then the lower id.
 */
export const earlierGrouping = (
  a: Pick<MatchMiner, 'id' | 'createdAt'>,
  b: Pick<MatchMiner, 'id' | 'createdAt'>
): number => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);

/** A Reason code: `MT` and six base-36 characters, standing on its own. */
const CODE_TOKEN = /(?<![0-9A-Za-z])MT[0-9A-Z]{6}(?![0-9A-Za-z])/gi;

/** The Reason codes a donation's reason carries, upper-cased, once each. */
export function codesIn(reason: string | undefined): string[] {
  return [...new Set((reason ?? '').match(CODE_TOKEN)?.map((c) => c.toUpperCase()) ?? [])];
}

/** The id of the Miner a Character is on its own (no grouping holds it). */
export const soloMinerId = (characterId: number): string => `solo:${characterId}`;

/** The Character a solo Miner id names; undefined for a grouping's id. */
export function soloCharacterId(minerId: string): number | undefined {
  const solo = /^solo:(\d+)$/.exec(minerId);
  return solo ? Number(solo[1]) : undefined;
}

/** The Miner a Character is billed under: its earliest grouping, else a Miner of its own. */
export function minerIdFor(
  characterId: number,
  miners: readonly Pick<MatchMiner, 'id' | 'characterIds' | 'createdAt'>[]
): string {
  let best: Pick<MatchMiner, 'id' | 'createdAt'> | undefined;
  for (const m of miners)
    if (m.characterIds.includes(characterId) && (!best || earlierGrouping(m, best) < 0)) best = m;
  return best?.id ?? soloMinerId(characterId);
}

/** Where a stored Miner id lives now: its grouping, the group a solo id or an absorbed id folded into. */
export function currentMinerOf(minerId: string, miners: readonly MatchMiner[]): string {
  if (miners.some((m) => m.id === minerId)) return minerId;
  const folded = miners.find((m) => m.aliases?.includes(minerId));
  if (folded) return folded.id;
  const character = soloCharacterId(minerId);
  return character !== undefined ? minerIdFor(character, miners) : minerId;
}

/** Code → the Miners that hold it: one is whose money it is, more is ambiguous. */
export type CodeOwners = ReadonlyMap<string, readonly string[]>;

/**
 * Every code the book recognises and whose it is: each notice's printed code (or the one its id
 * hashes to), and the own code of each Miner, its aliases, its Characters' solo ids and every
 * other Miner id the book knows.
 */
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
  /** Characters the book has seen mine: a sender among them is their own Miner. */
  minedCharacterIds: ReadonlySet<number>;
  /** Per payer, the Miner ids their earlier payments named. */
  paidBefore?: ReadonlyMap<number, readonly string[]>;
}

export type DonationOwner =
  | { kind: 'miner'; minerId: string; by: 'sender' | 'code' | 'payer' }
  | { kind: 'ambiguous'; minerIds: string[] }
  | { kind: 'unmatched' };

/** One Miner, or the Miners it could be. */
function oneOf(named: ReadonlySet<string>, by: 'code' | 'payer'): DonationOwner | undefined {
  const ids = [...named].sort();
  if (ids.length === 0) return undefined;
  return ids.length === 1
    ? { kind: 'miner', minerId: ids[0], by }
    : { kind: 'ambiguous', minerIds: ids };
}

/** Whose money one donation is. */
export function donationOwner(
  donation: { characterId: number; reason?: string },
  book: MatchBook
): DonationOwner {
  const grouped = book.miners.some((m) => m.characterIds.includes(donation.characterId));
  if (grouped || book.minedCharacterIds.has(donation.characterId))
    return { kind: 'miner', minerId: minerIdFor(donation.characterId, book.miners), by: 'sender' };
  const coded = new Set(codesIn(donation.reason).flatMap((code) => book.codes.get(code) ?? []));
  const payer = new Set(
    (book.paidBefore?.get(donation.characterId) ?? []).map((id) => currentMinerOf(id, book.miners))
  );
  return oneOf(coded, 'code') ?? oneOf(payer, 'payer') ?? { kind: 'unmatched' };
}

/** What resolving puts on a stored donation: its Miner, or the review an ambiguous one waits for. */
export type ResolvedOwner =
  | { minerId: string }
  | { reviewReason: 'ambiguous'; ambiguousMinerIds: string[] }
  | Record<string, never>;

/**
 * The book the resolver reads, from what either side loaded: the groupings, every Late notice
 * (its code), the Characters seen mining what the book bills, the Miner ids it holds a record of
 * (a recorded account, a billed-by pointer), and the Miners each payer's earlier payments named.
 */
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

/** A stored payment, as a re-match reads it. */
export interface UnmatchedCandidate {
  id: string;
  characterId?: number;
  reason?: string;
  minerId?: string;
  at: string;
  notTaxAmount?: number;
  reviewReason?: string;
}

/**
 * The Unmatched payments that now have a Miner, oldest first: a sender or code the book has come
 * to know since. One already placed, marked not tax, or held for an officer as ambiguous is left.
 */
export function rematchUnmatched(
  payments: readonly UnmatchedCandidate[],
  book: MatchBook
): { paymentId: string; minerId: string }[] {
  return [...payments]
    .filter(
      (p) =>
        p.minerId === undefined &&
        typeof p.characterId === 'number' &&
        !(p.notTaxAmount && p.notTaxAmount > 0) &&
        p.reviewReason !== 'ambiguous'
    )
    .sort((a, b) => a.at.localeCompare(b.at))
    .flatMap((p) => {
      const owner = donationOwner({ characterId: p.characterId!, reason: p.reason }, book);
      return owner.kind === 'miner' ? [{ paymentId: p.id, minerId: owner.minerId }] : [];
    });
}

/** What resolving puts on one stored donation: its Miner, or the review it waits for. */
export function ownerFields(
  donation: { characterId: number; reason?: string },
  book: MatchBook
): ResolvedOwner {
  const owner = donationOwner(donation, book);
  if (owner.kind === 'miner') return { minerId: owner.minerId };
  if (owner.kind === 'ambiguous')
    return { reviewReason: 'ambiguous', ambiguousMinerIds: owner.minerIds };
  return {};
}

/** Each donation with the Miner it pays, or held for review when it could be several Miners'. */
export function resolveDonationOwners<T extends { characterId: number; reason?: string }>(
  donations: readonly T[],
  book: MatchBook
): (T & ResolvedOwner)[] {
  return donations.map((d) => ({ ...d, ...ownerFields(d, book) }));
}

/** The most donations into other divisions a sync notes (#6207). */
export const UNCOUNTED_LIMIT = 20;

export interface UncountedDonation {
  id: string;
  refId: number;
  division: number;
  characterId: number;
  amount: number;
  at: string;
}

/** A donation into a division the book does not read, as the journal gave it. */
type ElsewhereDonation = {
  refId: number;
  division: number;
  characterId: number;
  amount: number;
  at: string;
  reason?: string;
};

/**
 * The donations into divisions the book does not read that look like tax (#6207): one carrying a
 * code the book knows, one an officer has to place, or one whose sender's Miner mined what the book
 * bills (`mined`, `minedSinceStart`). Newest first, at most `UNCOUNTED_LIMIT`.
 */
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

/**
 * @deprecated `noteUncountedDonations`: a Running account has no open balance a sync reads, and
 * nothing counted takes one down. Kept only until the client's sync calls the new one.
 */
export function uncountedDonations(
  donations: readonly ElsewhereDonation[],
  book: MatchBook & { openBalance?: ReadonlyMap<string, number>; unbilled: ReadonlySet<string> }
): UncountedDonation[] {
  return noteUncountedDonations(donations, book, book.unbilled);
}
