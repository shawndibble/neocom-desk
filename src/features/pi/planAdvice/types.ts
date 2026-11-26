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
  books: SellBooks;
  market: SellMarket;
  cadence: PiCadence;
  preference: RebuildPreference;
  recipeFilter: RecipeFilter;
  whatIfTypes?: readonly PlanetType[];
  skills: {
    commandCenterUpgrades: number | null;
    interplanetaryConsolidation: number | null;
  };
  routesBySystem?: ReadonlyMap<number, readonly RouteSystem[] | null>;
  planetNames?: ReadonlyMap<number, string>;
}

export interface PlanColonyAdvice extends ColonyAdvice {
  name: string | null;
  anchor: string;
  systemId: number;
  upgradeLevel: number;
  taxRate: number;
  taxAssumed: boolean;
  rebuildFit: RecipeFit | null;
  sells: readonly number[];
}

export interface RankingBasis {
  rateSource: 'measured' | 'assumed';
  ccLevel: number;
  ccAssumed: boolean;
  linkCost: 'borrowed' | 'assumed';
}

export interface PlanAdvice {
  preference: RebuildPreference;
  market: SellMarket;
  colonies: PlanColonyAdvice[];
  excluded: { planetId: number; name: string | null; reason: 'no-detail' }[];
  quickWins: QuickWin[];
  totals: PlanTotals;
  haul: HaulSummary;
  slots: SlotNudge;
  recipes: RecipeRanking;
  recipesWithTagged: RecipeRanking;
  recipeRows: RecipeRow[];
  rawRows: RawRow[];
  rawUnpriced: number[];
  rankingBasis: RankingBasis;
  chainBasis: ChainBasis;
  chainColonies: PlannerColony[];
}

export interface RawRow {
  typeId: number;
  planetType: PlanetType;
  iskPerDay: number;
}

export interface ColonyWork {
  advice: ColonyAdvice;
  sells: number[];
  m3PerDay: number | null;
  todayM3PerDay: number | null;
}
