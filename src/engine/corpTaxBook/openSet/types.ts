import type {
  Allocation,
  AllocationInput,
  DismissalCredit,
  RecordedWriteOff,
  TaxPayment,
} from '../allocation';
import type { DayCharge, Miner } from '../charges';
import type { FeederCoverage } from '../coverage';
import type { Dismissal } from '../dismissals';
import type { FeederReadClock, StaleHold } from '../feederHealth';
import type { Declaration, OverdueStatus } from '../overdue';
import type { TaxRate } from '../rates';
import type { Statement } from '../statements';
import type { SettlePayment, SyncExtraction } from '../sync';
import type { ObservedMiningEntry } from '../types';
import type { DayPrices } from '../valuation';

/** The moon and Extraction a refinery was working on a date, when known. */
export type PlaceOf = (
  structureId: number,
  date: string
) => { moonId?: number; extractionId?: string };

/**
 * How a refinery-day is placed. An officer has the book's Extractions and each structure's
 * expiry (ADR 0032: the same placement the server stamps). A member cannot read Extractions
 * (`firestore.rules`, officer-only), so it takes the moon the server stamped on its own rows.
 */
export type Placement =
  | {
      extractions: readonly SyncExtraction[];
      structureExpiryHours: Readonly<Record<string, number>>;
    }
  | 'observed-rows';

/** One book's unbilled and unpaid side, as the reader can see it. */
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
  statements: readonly Statement[];
  payments: readonly SettlePayment[];
  dismissals: readonly Dismissal[];
  writeOffs?: readonly RecordedWriteOff[];
  declarations?: readonly Declaration[];
  /** Days after issue an unsettled Statement goes Overdue; absent: the default. */
  overdueDays?: number;
  /** Moon owners' coverage and read clock; absent means none. */
  feeders?: readonly (FeederCoverage & FeederReadClock)[];
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  placement: Placement;
}

/** One Miner's side of the open set. */
export interface MinerSettlement {
  statements: Statement[];
  /** Its Tax Payments; a donation dated before the book is neither credited nor listed. */
  payments: TaxPayment[];
  dismissalCredits: DismissalCredit[];
  /** What `allocation` was computed from, so a payment can be previewed against it. */
  allocationInput: AllocationInput;
  allocation: Allocation;
  /** Each unsettled Statement's Overdue clock, in Statement order. */
  overdue: ReadonlyMap<string, OverdueStatus>;
  /** The book's `billableThrough`, stopped before a day of this Miner's that is held (#6209). */
  billableThrough: string | undefined;
  /** The earliest hold on one of its characters, naming the moon owner (#6210). */
  hold?: StaleHold;
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
  /** Groupings, then the ids days, Statements and payments name, in that order. */
  minerIds: string[];
  miners: ReadonlyMap<string, MinerSettlement>;
}
