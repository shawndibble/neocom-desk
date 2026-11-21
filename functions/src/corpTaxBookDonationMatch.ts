// Whose money a donation is (decision 20261120-235011): the one matching rule for the client and
// the Cloud Functions (decision 20261117-230113), dependency-free so both import it.
//
// A sender the book knows pays their own Miner, whatever code the reason names. A stranger's
// donation is named by the Reason codes it carries: each Miner's own code (`minerPaymentCode`, for
// the Miner, each id folded into it and each of its Characters' solo ids) and every code a Late
// notice printed. A code held by two Miners, or a reason naming two Miners, is no one's: it stays
// unmatched for an officer. A code only says whose money it is; it pays that Miner's oldest day.

import { minerPaymentCode, paymentCode } from './corpTaxBookLateNotice.js';

/** A Miner grouping, with the ids folded into it (`aliases`). */
export interface MatchMiner {
  id: string;
  characterIds: readonly number[];
  aliases?: readonly string[];
}

/** A Reason code: `MT` and six base-36 characters, standing on its own. */
const CODE_TOKEN = /(?<![0-9A-Za-z])MT[0-9A-Z]{6}(?![0-9A-Za-z])/gi;

/** The Reason codes a donation's reason carries, upper-cased, once each. */
export function codesIn(reason: string | undefined): string[] {
  return [...new Set((reason ?? '').match(CODE_TOKEN)?.map((c) => c.toUpperCase()) ?? [])];
}

/** The Miner a Character is billed under: its grouping, else a Miner of its own. */
export function minerIdFor(characterId: number, miners: readonly MatchMiner[]): string {
  return miners.find((m) => m.characterIds.includes(characterId))?.id ?? `solo:${characterId}`;
}

/** Where a stored Miner id lives now: its grouping, the group a solo id or an absorbed id folded into. */
export function currentMinerOf(minerId: string, miners: readonly MatchMiner[]): string {
  if (miners.some((m) => m.id === minerId)) return minerId;
  const folded = miners.find((m) => m.aliases?.includes(minerId));
  if (folded) return folded.id;
  const solo = /^solo:(\d+)$/.exec(minerId);
  return solo ? minerIdFor(Number(solo[1]), miners) : minerId;
}

/** Code → the Miner it names, or null when two Miners hold it. */
export type CodeOwners = ReadonlyMap<string, string | null>;

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
  const owners = new Map<string, string | null>();
  const add = (code: string, minerId: string) => {
    const owner = currentMinerOf(minerId, miners);
    const held = owners.get(code);
    owners.set(code, held === undefined || held === owner ? owner : null);
  };
  for (const n of notices) add((n.code ?? paymentCode(n.id)).toUpperCase(), n.minerId);
  const ids = new Set<string>(knownMinerIds);
  for (const m of miners) {
    ids.add(m.id);
    for (const a of m.aliases ?? []) ids.add(a);
    for (const c of m.characterIds) ids.add(`solo:${c}`);
  }
  for (const id of ids) add(minerPaymentCode(id), id);
  return owners;
}

export interface MatchBook {
  miners: readonly MatchMiner[];
  codes: CodeOwners;
  /** Characters the book has seen mine or pay. */
  knownCharacterIds: ReadonlySet<number>;
}

export type DonationOwner =
  | { kind: 'miner'; minerId: string; by: 'sender' | 'code' }
  | { kind: 'ambiguous' }
  | { kind: 'unmatched' };

/** Whose money one donation is. */
export function donationOwner(
  donation: { characterId: number; reason?: string },
  book: MatchBook
): DonationOwner {
  const grouped = book.miners.some((m) => m.characterIds.includes(donation.characterId));
  if (grouped || book.knownCharacterIds.has(donation.characterId))
    return { kind: 'miner', minerId: minerIdFor(donation.characterId, book.miners), by: 'sender' };
  const named = new Set<string | null>();
  for (const code of codesIn(donation.reason)) {
    const owner = book.codes.get(code);
    if (owner !== undefined) named.add(owner);
  }
  if (named.size === 0) return { kind: 'unmatched' };
  const [only] = named;
  return named.size === 1 && only !== null
    ? { kind: 'miner', minerId: only, by: 'code' }
    : { kind: 'ambiguous' };
}

/** Each donation with the Miner it pays, when it has one; an ambiguous one is left for review. */
export function resolveDonationOwners<T extends { characterId: number; reason?: string }>(
  donations: readonly T[],
  book: MatchBook
): (T & { minerId?: string })[] {
  return donations.map((d) => {
    const owner = donationOwner(d, book);
    return owner.kind === 'miner' ? { ...d, minerId: owner.minerId } : d;
  });
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

/**
 * The donations into divisions the book does not read that look like tax (#6207): one carrying a
 * code the book knows, or one whose sender's Miner owes (an open balance less what was already
 * counted, or days not yet listed). Newest first, at most `UNCOUNTED_LIMIT`.
 */
export function uncountedDonations(
  donations: readonly {
    refId: number;
    division: number;
    characterId: number;
    amount: number;
    at: string;
    reason?: string;
  }[],
  book: MatchBook & {
    openBalance: ReadonlyMap<string, number>;
    unbilled: ReadonlySet<string>;
  },
  counted: readonly { minerId?: string; amount: number }[] = []
): UncountedDonation[] {
  const openBalance = new Map(book.openBalance);
  for (const c of counted)
    if (c.minerId !== undefined)
      openBalance.set(c.minerId, (openBalance.get(c.minerId) ?? 0) - c.amount);
  return donations
    .filter((d) => {
      const owner = donationOwner(d, book);
      if (owner.kind === 'ambiguous' || (owner.kind === 'miner' && owner.by === 'code'))
        return true;
      return (
        owner.kind === 'miner' &&
        ((openBalance.get(owner.minerId) ?? 0) > 0 || book.unbilled.has(owner.minerId))
      );
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
