import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import type {
  ColonyAdvice,
  PlanTotals,
  QuickWin,
  RebuildPreference,
  SellBooks,
  SellMarket,
  SlotNudge,
} from '@/engine/pi/planAdvice';
import type { HaulSummary, RouteSystem } from '@/engine/pi/planHaul';
import type { RecipeFilter, RecipeFit, RecipeRanking, RecipeRow } from '@/engine/pi/planRecipes';
import type { PiCadence } from '../cadencePref';
import type { PlannerPrefs, PlannerSnapshot } from '../goalPlannerModel';
import type { ChainBasis } from '../chainEstimateModel';

export interface PlanAdviceInput {
  snapshot: PlannerSnapshot;
  prefs: Pick<
    PlannerPrefs,
    'restartHours' | 'fallbackRatePerHour' | 'customsOverrides' | 'richness'
  >;
  /** The hub's books; `market` decides whether a buyback replaces them. */
  books: SellBooks;
  market: SellMarket;
  cadence: PiCadence;
  preference: RebuildPreference;
  recipeFilter: RecipeFilter;
  /** Planet types to treat as owned for the ranking: "what if I add a Lava planet". */
  whatIfTypes?: readonly PlanetType[];
  skills: {
    /** Command Center Upgrades, effective level; null when skills never loaded. */
    commandCenterUpgrades: number | null;
    /** Interplanetary Consolidation, effective level; null when skills never loaded. */
    interplanetaryConsolidation: number | null;
  };
  /**
   * Systems from each colony's system to the sell market, origin first, with
   * their security. A missing entry is an unresolved route (unknown, not zero).
   * Ignored for a corp buyback, which is collected at home.
   */
  routesBySystem?: ReadonlyMap<number, readonly RouteSystem[] | null>;
  planetNames?: ReadonlyMap<number, string>;
}

export interface PlanColonyAdvice extends ColonyAdvice {
  name: string | null;
  /** The element id Plan gives this colony's card; `#plan-…` deep links scroll to it. */
  anchor: string;
  systemId: number;
  upgradeLevel: number;
  taxRate: number;
  /** The customs rate is a stand-in for an unknown player-office rate. */
  taxAssumed: boolean;
  /**
   * What the recommended rebuild draws against the Command Center it needs, for
   * the checklist's fit meters. Null unless the recommendation is a change.
   */
  rebuildFit: RecipeFit | null;
  /** The typeIDs the colony sells today: what a Keep card says it stays on. */
  sells: readonly number[];
}

export interface RankingBasis {
  /** Where the per-extractor rate came from. */
  rateSource: 'measured' | 'assumed';
  ccLevel: number;
  ccAssumed: boolean;
  linkCost: 'borrowed' | 'assumed';
}

export interface PlanAdvice {
  preference: RebuildPreference;
  market: SellMarket;
  colonies: PlanColonyAdvice[];
  /** Colonies left out, with the reason: no detail loaded, say. */
  excluded: { planetId: number; name: string | null; reason: 'no-detail' }[];
  /** Every colony's quick wins, best ISK per minute first. */
  quickWins: QuickWin[];
  totals: PlanTotals;
  haul: HaulSummary;
  slots: SlotNudge;
  recipes: RecipeRanking;
  /**
   * `recipes` plus the setups a higher Command Center hosts, tagged
   * `needsCcLevel` and ranked below every one that fits: what Plan's Find best
   * lists, so the Map's picks and tiles read the same rows.
   */
  recipesWithTagged: RecipeRanking;
  /**
   * Every priced one-planet recipe on every planet type, before filtering. Plan's
   * "Find the best thing to build" re-ranks these under its own toggles and
   * what-if planets, so the figures stay this model's.
   */
  recipeRows: RecipeRow[];
  /**
   * What one planet earns extracting and selling each raw P0, per planet type,
   * at the same prices and assumptions. Shown in All products only: P0 is
   * never ranked or recommended.
   */
  rawRows: RawRow[];
  /** Raw P0 the sell market quotes no price for. */
  rawUnpriced: number[];
  rankingBasis: RankingBasis;
  /**
   * The same assumptions, resolved for a multi-planet chain estimate
   * (`chainEstimateModel.ts`): priced lazily, never part of the ranking.
   */
  chainBasis: ChainBasis;
  /**
   * The colonies as the Goal Planner's solver reads them (measured rates, own
   * Command Center and customs): what Plan's Bigger chains lay a P3 or P4 on.
   * Read only when the pilot opted in to hauling between planets.
   */
  chainColonies: PlannerColony[];
}

/** One raw P0 on one planet type: ISK a day from one planet selling it as extracted. */
export interface RawRow {
  typeId: number;
  planetType: PlanetType;
  iskPerDay: number;
}

export interface ColonyWork {
  advice: ColonyAdvice;
  /** What the colony sells today: its factories' products, else the raw it extracts. */
  sells: number[];
  m3PerDay: number | null;
  todayM3PerDay: number | null;
}
