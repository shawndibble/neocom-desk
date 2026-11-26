import type { PiFactoryKind, PiRawResource } from '@/sde/types';
import type { PinCounts, PinLoad, PiTier } from './types';

export type PlanetType = PiRawResource['planetTypes'][number];

export type RateSource = 'measured' | 'own-mean' | 'assumed';

export interface EcuRate {
  unitsPerHour: number;
  source: RateSource;
}

export interface PlannerColony {
  planetId: number;
  planetType: PlanetType;
  budget: PinLoad;
  newLinkCost: PinLoad;
  headsPerExtractor: number;
  taxRate: number;
  ratePerEcu: ReadonlyMap<number, EcuRate>;
  current: {
    p0TypeIds: readonly number[];
    productTypeIds: readonly number[];
    ecusByP0?: ReadonlyMap<number, number>;
  };
}

export interface Goal {
  typeId: number;
  unitsPerDay: number;
  buyShare?: ReadonlyMap<number, number>;
}

export interface PlannerPolicy {
  maxEcusPerColony: number;
  maxP0TypesPerColony: 1 | 2;
  extraEcuFactor: number;
  buyTiers: readonly PiTier[];
}

export interface PriceBooks {
  ask: Readonly<Record<number, number>>;
  bid: Readonly<Record<number, number>>;
  salesTaxPct: number;
}

export interface ExtractionSlot {
  p0TypeId: number;
  p1TypeId: number;
  ecus: number;
  p0PerHour: number;
  p1PerHour: number;
  basicFactories: number;
  rateSource: RateSource;
}

export type FitLimit = 'cpu' | 'powergrid';

export type DemandSource = 'made' | 'bought' | 'short' | 'extracted' | 'not-extracted' | 'blocked';

export interface DemandLine {
  typeId: number;
  tier: PiTier;
  unitsPerHour: number;
  factories: number | null;
  source: DemandSource;
  madeFraction: number;
  blockedBy?: number[];
}

export type ColonyRole = 'extract' | 'factory' | 'baseline' | 'idle';

export interface ColonyAssignment {
  planetId: number;
  role: ColonyRole;
  slots: ExtractionSlot[];
  factories: PinCounts;
  pins: PinCounts;
  used: PinLoad;
  budget: PinLoad;
  limitedBy: FitLimit[];
  runningToday?: true;
}

export type Shortfall =
  | {
      kind: 'type-gap';
      p0TypeId: number;
      p1TypeId: number;
      unitsPerHour: number;
      p1UnitsPerHour: number;
      fixPlanetTypes: PlanetType[];
    }
  | {
      kind: 'budget-gap';
      p0TypeId: number;
      p1TypeId: number;
      unitsPerHour: number;
      p1UnitsPerHour: number;
      retargetCandidates: number[];
    }
  | { kind: 'no-factory-host'; facility: PiFactoryKind }
  | { kind: 'host-over-budget'; planetId: number; limitedBy: FitLimit[] };

export type FlowEnd = number | 'hub';

export interface Flow {
  from: FlowEnd;
  to: FlowEnd;
  typeId: number;
  tier: PiTier;
  unitsPerHour: number;
  jumps?: number | null;
}

export type JumpsFn = (fromPlanetId: number, to: number | 'hub') => number | null;

export interface HaulEffort {
  m3JumpsPerHour: number;
  unknownLegs: number;
}

export type FactoryHostReason = 'only-eligible' | 'least-needed-extraction' | 'forced' | 'best-net';

export interface GoalPlan {
  goals: Goal[];
  achieved: { typeId: number; unitsPerHour: number; fraction: number }[];
  demand: DemandLine[];
  assignments: ColonyAssignment[];
  factoryHost: { planetId: number; reason: FactoryHostReason } | null;
  shortfalls: Shortfall[];
  buys: { typeId: number; tier: PiTier; unitsPerHour: number }[];
  surplusP1: { typeId: number; unitsPerHour: number }[];
  flows: Flow[];
  haulEffort: HaulEffort;
  hauling: {
    m3PerWeek: number;
    perColony: Map<number, number>;
  };
}
