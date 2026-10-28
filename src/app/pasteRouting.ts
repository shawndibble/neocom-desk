import type { Location } from 'react-router-dom';
import { looksLikeEftFit } from '@/engine/import/eftFit';
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

/** A path and the route state carrying the pasted text. */
export type RouteTarget = [string, { state: unknown }];

/** A Local list and a D-Scan share a route: Pilot Lookup reads either. */
const pilotLookup = (text: string): RouteTarget => [
  '/travel/pilot',
  { state: { pilotListText: text } satisfies PilotListState },
];

/**
 * Per destination: where the paste goes, carrying its text in route state.
 * Keyed by `PasteDestination`, so once a new id is added to that union, a
 * missing route here fails the typecheck.
 */
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

/** What {@link classifyPaste} made of a paste. */
interface Classified {
  destination: PasteDestination | null;
  /**
   * The market catalogue or the hull names could not be loaded (offline, never
   * downloaded), so a `null` destination may only mean "could not tell".
   */
  degraded: boolean;
}

/**
 * Classifies a paste off the critical path: the parsers and the data they
 * match against load on the first page-level paste, not with the signed-in
 * shell. Each source is loaded on its own and a missing one only costs the
 * destinations that need it: the market catalogue (not precached) is read by
 * the item-list Appraisal alone, and the hull names fall back to the
 * precached `types.json`, so a skill plan, D-Scan, fit or blueprint list
 * still routes with no connection.
 */
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
    // A skill catalogue that won't load costs only the skill-plan route.
    loadSkillNameMap().catch(() => new Map<string, { typeID: number }>()),
    // Without the blueprint data a blueprint list is just not recognised; the
    // fit and item-list pastes must not depend on it.
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

/**
 * Whether a paste is shaped like something the router would have placed with
 * its data: an EFT fit, or several short lines (names with quantities, or tab
 * columns), as an inventory copy or multibuy is. An ordinary paragraph is not,
 * so a pilot pasting prose offline is not told about item data.
 */
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

/** Where a paste goes: a route and its state, or nowhere. */
export interface PasteRoute {
  /** `null`: the paste is ordinary text and stays where it landed. */
  route: RouteTarget | null;
  /** A list-shaped paste could not be read for want of data (offline, parsers failed to load). */
  unreadable: boolean;
}

/**
 * The one place a paste is turned into a destination, for the app-wide router
 * and the Command Palette's input alike. Without the market catalogue an item
 * list cannot be told from a Local list of names, so a "pilot list" verdict is
 * not trusted then: Pilot Lookup is no use offline either. A D-Scan (type ids)
 * is still unmistakable. Never rejects: a failure to load the parsers is
 * `unreadable`, not an error.
 */
export async function routePaste(
  text: string,
  here: Pick<Location, 'pathname' | 'search'>
): Promise<PasteRoute> {
  let classified: Classified;
  try {
    classified = await classifyPaste(text);
  } catch {
    // Said only for a paste shaped like a list or a fit: prose is nobody's miss.
    return { route: null, unreadable: looksLikeList(text) };
  }
  const { destination, degraded } = classified;
  if (destination === null || (degraded && destination === 'pilotList')) {
    return { route: null, unreadable: degraded && looksLikeList(text) };
  }
  return { route: DESTINATIONS[destination](text, here), unreadable: false };
}
