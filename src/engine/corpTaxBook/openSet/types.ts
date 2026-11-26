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

export type Placement =
  | {
      kind: 'extractions';
      extractions: readonly SyncExtraction[];
      structureExpiryHours: Readonly<Record<string, number>>;
    }
  | { kind: 'observed-rows' };

export interface OpenSetInput {
  corporationId: number;
  now: string;
  startDate: string;
  graceHours?: number;
  lastSyncedAt?: string;
  rates: readonly TaxRate[];
  entries: readonly ObservedMiningEntry[];
  miners: readonly Miner[];
  notices: readonly LateNotice[];
  payments: readonly SettlePayment[];
  dismissals: readonly Dismissal[];
  adjustments?: readonly Adjustment[];
  writeOffs?: readonly RecordedWriteOff[];
  disputes?: readonly OreDispute[];
  toleranceExemptions?: readonly ToleranceExemption[];
  dayTolerancePct?: number;
  minerPaidThrough?: ReadonlyMap<string, string>;
  checkpoints?: ReadonlyMap<string, RunningAccountCheckpoint>;
  feeders?: readonly (FeederCoverage & FeederReadClock)[];
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  placement: Placement;
}

export interface MinerSettlement {
  characterIds: number[];
  notices: LateNotice[];
  payments: TaxPayment[];
  billableThrough: string | undefined;
  hold?: StaleHold;
  billable: BillableLines;
  heldDays: ReadonlySet<string>;
  account: MinerRunningAccount;
}

export interface OpenSet {
  placeOf: PlaceOf;
  charges: DayCharge[];
  beforeBook: ObservedMiningEntry[];
  unrated: ObservedMiningEntry[];
  outsideCoverage: ObservedMiningEntry[];
  unread: ObservedMiningEntry[];
  billableThrough: string | undefined;
  minerIds: string[];
  miners: ReadonlyMap<string, MinerSettlement>;
}
