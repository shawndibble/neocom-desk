/**
 * The Corp overview's own reads: their shapes, and thin loaders that pull the
 * real work in behind `import()` (`corpFeedLoaders.ts`), like the structure
 * and moon reads in `../../data/boardData.ts`. The corp reads, role checks and
 * engines are for the few pilots with corp roles; the Overview's first paint
 * must not carry them for everyone else.
 *
 * Every corp feed answers three different ways, and the builders keep them
 * apart:
 * - `readable: false`: this Character may not read it (no role, or a lapsed
 *   grant when `needsReauth`). No request was made.
 * - a thrown load: the read was allowed and failed. The widget shows Retry.
 * - data, possibly an empty list: read fine.
 */
import type { CorporationIndustryJob } from '@/esi/endpoints';
import type { MemberActivity, RosterDiff } from '@/engine/corp/members';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { WalletDivision } from '@/features/corp/divisions';

interface CorpFeedBase {
  readable: boolean;
  /** Unreadable because the grant lapsed: Grant access fixes it. */
  needsReauth: boolean;
  /** The oldest read behind the feed; null when none was made. */
  fetchedAt: Date | null;
  fromCache: boolean;
}

/** One master-wallet journal line, reduced to what the money builders read. */
export interface CorpJournalLine {
  atMs: number;
  /** Signed as ESI signs it: negative is money leaving the corporation. */
  amount: number;
  /** ESI's `ref_type` ("bounty_prizes", "market_transaction"...). */
  refType: string;
}

export interface CorpWalletFeed extends CorpFeedBase {
  /** Each division's balance, named by the corporation's own division names. */
  divisions: WalletDivision[];
  /** The division whose journal is read: the master wallet. */
  journalDivision: number;
  /**
   * That division's journal, or null when its read failed while the balances
   * read fine: net and runway are then unknown, not 0.
   */
  journal: CorpJournalLine[] | null;
}

export interface CorpJobsFeed extends CorpFeedBase {
  jobs: CorporationIndustryJob[];
  typeNames: ReadonlyMap<number, string>;
  /** Installer names, for the table. */
  installerNames: ReadonlyMap<number, string>;
}

export interface CorpMembersFeed extends CorpFeedBase {
  members: MemberActivity[];
  /**
   * Joins and leaves since this device last opened the roster, read and never
   * recorded (`/corp/members` owns that). Null when the member id list could
   * not be read: unknown, not "nothing changed".
   */
  diff: RosterDiff | null;
  /** Names for every member the widgets name: the inactive, the joined and the left. */
  names: ReadonlyMap<number, string>;
  /** The pilot's "dark after" setting when the read was made, in days. */
  darkAfterDays: number;
  /** When the read was made, for "N days since" figures. */
  loadedAt: number;
}

export interface CorpMiningFeed extends CorpFeedBase {
  /** Every refinery ledger row ESI returned (each a miner, ore type and day). */
  rows: ObservedRow[];
  /** How many refineries keep a ledger, rows or not. */
  refineryCount: number;
  /** A page was missing, so the rows may not be the whole ledger. */
  truncated: boolean;
  typeNames: ReadonlyMap<number, string>;
  minerNames: ReadonlyMap<number, string>;
}

/** One tower, reduced to what the Starbases builder reads. */
export interface CorpStarbaseRow {
  starbaseId: number;
  systemId: number;
  /** The tower's own type: its size and faction decide the burn rate. */
  typeId: number;
  /** ESI's `state`; "unknown" when it sent none. */
  state: string;
  reinforcedUntilMs: number | null;
  unanchorsAtMs: number | null;
  /**
   * What the bay held when read; null when no detail was read (the tower is not
   * online, or its read failed): unknown, not empty.
   */
  bay: { fuelBlocks: number; strontium: number } | null;
}

export interface CorpStarbasesFeed extends CorpFeedBase {
  starbases: CorpStarbaseRow[];
  typeNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
}

export async function loadCorpWalletFeed(characterId: number): Promise<CorpWalletFeed> {
  const { loadCorpWallet } = await import('./corpFeedLoaders');
  return loadCorpWallet(characterId);
}

export async function loadCorpJobsFeed(characterId: number): Promise<CorpJobsFeed> {
  const { loadCorpJobs } = await import('./corpFeedLoaders');
  return loadCorpJobs(characterId);
}

export async function loadCorpMembersFeed(characterId: number): Promise<CorpMembersFeed> {
  const { loadCorpMembers } = await import('./corpFeedLoaders');
  return loadCorpMembers(characterId);
}

export async function loadCorpMiningFeed(characterId: number): Promise<CorpMiningFeed> {
  const { loadCorpMining } = await import('./corpFeedLoaders');
  return loadCorpMining(characterId);
}

export async function loadCorpStarbasesFeed(characterId: number): Promise<CorpStarbasesFeed> {
  const { loadCorpStarbases } = await import('./corpFeedLoaders');
  return loadCorpStarbases(characterId);
}
