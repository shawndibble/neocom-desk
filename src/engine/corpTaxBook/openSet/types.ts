import type { LateNotice } from '../../../../functions/src/corpTaxBookLateNotice';
import type { RunningAccountCheckpoint } from '../../../../functions/src/corpTaxBookCheckpoint';
import type { Adjustment } from '../adjustments';
import type { BillableLines } from '../billableLines';
import type { DayCharge, Miner, PlaceOf } from '../charges';
import type { FeederCoverage } from '../coverage';
import type { Dismissal } from '../dismissals';
import type { OreDispute } from '../disputes';
import type { FeederReadClock, StaleHold } from '../feederHealth';
import type { MinerRunningAccount } from '../minerRunningAccount';
import type { RecordedWriteOff, TaxPayment } from '../payments';
import type { TaxRate } from '../rates';
import type { SettlePayment, SyncExtraction } from '../sync';
import type { ToleranceExemption } from '../toleranceExemptions';
import type { ObservedMiningEntry } from '../types';
import type { DayPrices } from '../valuation';

/**
 * How a refinery-day is placed. An officer has the book's Extractions and each structure's
 * expiry (ADR 0032: the same placement the server stamps). A member cannot read Extractions
 * (`firestore.rules`, officer-only), so it takes the moon the server stamped on its own rows.
 */
export type Placement =
  | {
      kind: 'extractions';
      extractions: readonly SyncExtraction[];
      structureExpiryHours: Readonly<Record<string, number>>;
    }
  | { kind: 'observed-rows' };

/** One book's open side, as the reader can see it. */
export interface OpenSetInput {
  corporationId: number;
  /** ISO instant the set is read at. */
  now: string;
  startDate: string;
  graceHours?: number;
  /** The book's last sync by any officer; absent when never synced. */
  lastSyncedAt?: string;
  rates: readonly TaxRate[];
  entries: readonly ObservedMiningEntry[];
  miners: readonly Miner[];
  /** The book's late notices: what was asked, never money owed of its own. */
  notices: readonly LateNotice[];
  payments: readonly SettlePayment[];
  dismissals: readonly Dismissal[];
  adjustments?: readonly Adjustment[];
  /** Officer write-offs (#4637): each forgives the Miner's oldest unpaid days. */
  writeOffs?: readonly RecordedWriteOff[];
  /** Members' disputes: an open one holds its day out of what is due. */
  disputes?: readonly OreDispute[];
  /** Officers' per-day limits on what a shortfall may forgive (`toleranceExemptions`). */
  toleranceExemptions?: readonly ToleranceExemption[];
  /** The book's per-day tolerance, in percent. */
  dayTolerancePct?: number;
  /** Each Miner's stored paid-through day (`meta/paid`): it and every day before it stay paid (D22). */
  minerPaidThrough?: ReadonlyMap<string, string>;
  /** Each Miner's closed-through checkpoint, by Miner id. */
  checkpoints?: ReadonlyMap<string, RunningAccountCheckpoint>;
  /**
   * Feeders' last good ledger reads. A feeder's refinery days are withheld until one lands after
   * the day's grace (#4509), and a day outside its coverage owes nothing (#4618); absent means none.
   */
  feeders?: readonly (FeederCoverage & FeederReadClock)[];
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  placement: Placement;
}

/** One Miner's side of the open set. */
export interface MinerSettlement {
  /** Its grouping's characters, or the one a `solo:` id names. */
  characterIds: number[];
  /** Its late notices, oldest first. */
  notices: LateNotice[];
  /** Its Tax Payments; a donation dated before the book is neither credited nor listed. */
  payments: TaxPayment[];
  /** The book's `billableThrough`, stopped before a day of this Miner's that is held (#6209). */
  billableThrough: string | undefined;
  /** The earliest hold on one of its characters, naming the moon owner (#6210). */
  hold?: StaleHold;
  /** What its account bills, and the days a dismissal keeps off it. */
  billable: BillableLines;
  /** Dates an open dispute holds. */
  heldDays: ReadonlySet<string>;
  /** Its Running account: what it owes, paid through, its credit. */
  account: MinerRunningAccount;
}

export interface OpenSet {
  placeOf: PlaceOf;
  /** Every rated, readable day from the start date on. */
  charges: DayCharge[];
  /** Mining before the book's start date: history that owes nothing. */
  beforeBook: ObservedMiningEntry[];
  /** Days no rate covers yet. */
  unrated: ObservedMiningEntry[];
  /** Moon owner rows outside their coverage: kept, owe nothing. */
  outsideCoverage: ObservedMiningEntry[];
  /** Covered days a moon owner's ledger was not read well after: not Billable yet. */
  unread: ObservedMiningEntry[];
  /** The latest Billable day; undefined with no sync after the grace. */
  billableThrough: string | undefined;
  /** Groupings, then the ids days, notices and payments name, in that order. */
  minerIds: string[];
  miners: ReadonlyMap<string, MinerSettlement>;
}
