import type { Location } from 'react-router-dom';
import { looksLikeEftFit } from '@/engine/import/eftFit';
import { isSurveyScanText } from '@/engine/survey/parseScan';
import type { PasteDestination } from '@/engine/import/pasteDestination';
import { FITTINGS_PATH } from '@/features/fittings/fittingRoutes';
import { tabPath } from '@/lib/pageTabs';
import type {
  FittingLoadState,
  IndustryBlueprintListState,
  MarketAppraiseState,
  PilotListState,
  SkillPlanImportState,
  SurveyScanState,
} from '@/lib/shortcuts';
import { MARKET_TABS, MINING_TABS } from './pageTabs';

const SKILL_PLANS_PATH = '/skills/plans';

export type RouteTarget = [string, { state: unknown }];

const pilotLookup = (text: string): RouteTarget => [
  '/travel/pilot',
  { state: { pilotListText: text } satisfies PilotListState },
];

export const DESTINATIONS: Record<
  PasteDestination,
  (text: string, here: Pick<Location, 'pathname' | 'search'>) => RouteTarget
> = {
  survey: (text) => [
    tabPath(MINING_TABS, 'survey'),
    { state: { surveyScanText: text } satisfies SurveyScanState },
  ],
  fitting: (text) => [
    FITTINGS_PATH,
    { state: { fittingLoadText: text } satisfies FittingLoadState },
  ],
  appraisal: (text) => [
    tabPath(MARKET_TABS, 'appraisal'),
    { state: { appraiseText: text } satisfies MarketAppraiseState },
  ],
  skillPlan: (text) => [
    SKILL_PLANS_PATH,
    { state: { skillPlanImportText: text } satisfies SkillPlanImportState },
  ],
  blueprintList: (text) => [
    '/industry',
    { state: { blueprintListText: text } satisfies IndustryBlueprintListState },
  ],
  pilotList: pilotLookup,
  dscan: pilotLookup,
};

interface Classified {
  destination: PasteDestination | null;
  degraded: boolean;
}

async function classifyPaste(text: string): Promise<Classified> {
  const [
    { pasteDestination },
    { loadAppraisalCatalogue },
    { loadHullNames },
    { loadSkillNameMap },
    { loadBlueprintNames },
  ] = await Promise.all([
    import('@/engine/import/pasteDestination'),
    import('@/features/market/appraisalData'),
    import('@/features/fittings/hullNames'),
    import('@/features/skills/typeCatalog'),
    import('@/features/industry/blueprintNames'),
  ]);
  const [catalogue, hullNames, skillByName, blueprintNames] = await Promise.all([
    loadAppraisalCatalogue().catch(() => null),
    loadHullNames().catch(() => null),
    loadSkillNameMap().catch(() => new Map<string, { typeID: number }>()),
    loadBlueprintNames().catch(() => undefined),
  ]);
  const destination = pasteDestination(text, {
    catalogue: catalogue ?? new Map(),
    hullNames: hullNames ?? new Set(),
    skillByName,
    blueprintNames,
  });
  return { destination, degraded: catalogue === null || hullNames === null };
}

function looksLikeList(text: string): boolean {
  if (looksLikeEftFit(text)) return true;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length < 2) return false;
  return lines.every(
    (line) =>
      line.includes('\t') ||
      (line.length <= 60 && line.split(/\s+/).length <= 6 && !/[.!?:]$/.test(line))
  );
}

export interface PasteRoute {
  route: RouteTarget | null;
  unreadable: boolean;
}

export async function routePaste(
  text: string,
  here: Pick<Location, 'pathname' | 'search'>
): Promise<PasteRoute> {
  if (isSurveyScanText(text)) return { route: DESTINATIONS.survey(text, here), unreadable: false };
  let classified: Classified;
  try {
    classified = await classifyPaste(text);
  } catch {
    return { route: null, unreadable: looksLikeList(text) };
  }
  const { destination, degraded } = classified;
  if (destination === null || (degraded && destination === 'pilotList')) {
    return { route: null, unreadable: degraded && looksLikeList(text) };
  }
  return { route: DESTINATIONS[destination](text, here), unreadable: false };
}
