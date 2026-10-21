import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { Toast } from '@/components/ui';
import { looksLikeEftFit } from '@/engine/import/eftFit';
import type { PasteDestination } from '@/engine/import/pasteDestination';
import { FITTINGS_PATH } from '@/features/fittings/fittingRoutes';
import { tabPath } from '@/lib/pageTabs';
import {
  isTypingTarget,
  type FittingLoadState,
  type IndustryBlueprintListState,
  type MarketAppraiseState,
  type PilotListState,
  type SkillPlanImportState,
  type SurveyScanState,
} from '@/lib/shortcuts';
import { MARKET_TABS, MINING_TABS } from './pageTabs';

const SKILL_PLANS_PATH = '/skills/plans';

/** A Local list and a D-Scan share a route: Pilot Lookup reads either. */
const pilotLookup = (text: string): [string, { state: unknown }] => [
  '/travel/pilot',
  { state: { pilotListText: text } satisfies PilotListState },
];

/**
 * Per destination: where the paste goes, carrying its text in route state.
 * Keyed by `PasteDestination`, so once a new id is added to that union, a
 * missing route here fails the typecheck.
 */
const DESTINATIONS: Record<
  PasteDestination,
  (text: string, here: Pick<Location, 'pathname' | 'search'>) => [string, { state: unknown }]
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

/**
 * The app-wide paste router: Ctrl+V / Cmd+V anywhere on a page — not into a
 * field — with an EFT fit or an item list on the clipboard opens it in
 * Fittings or the Appraisal straight away. No confirm step: a mistaken paste
 * is one Back away, and every page keeps its own state across the trip.
 *
 * Mounted once from `Layout`. Steps aside only for a paste into a field (a
 * dialog's own import box handles its own paste); an open dialog, drawer or
 * menu does not block it.
 */
export function GlobalPasteRouter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Said when a paste that may have been a list could not be read for want of data.
  const [notice, setNotice] = useState<string | null>(null);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });
  // Only the latest paste may navigate, whichever classifies first.
  const latestPaste = useRef(0);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      // Only where the paste actually lands: a field that still holds focus
      // elsewhere, or an overlay that is open (or left in the DOM), must not
      // swallow a paste that is aimed at the page. A dialog's own import box is
      // a field, so it is still left alone.
      if (isTypingTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.trim() === '') return;

      const id = ++latestPaste.current;
      // Said only for a paste shaped like a list or a fit: prose is nobody's miss.
      const unreadable = () => {
        if (id === latestPaste.current && looksLikeList(text))
          setNotice(t('shortcuts.pasteOffline'));
      };
      classifyPaste(text).then(({ destination, degraded }) => {
        if (id !== latestPaste.current) return;
        // Without the market catalogue an item list cannot be told from a Local
        // list of names, so a "pilot list" verdict is not trusted: Pilot Lookup
        // is no use offline either. A D-Scan (type ids) is still unmistakable.
        if (destination === null || (degraded && destination === 'pilotList')) {
          if (degraded) unreadable();
          return;
        }
        void navigate(...DESTINATIONS[destination](text, locationRef.current));
        // The parsers themselves failed to load: the pilot can still paste
        // into Fittings' Load or the Appraisal box by hand, and is told so.
      }, unreadable);
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [navigate, t]);

  return notice === null ? null : <Toast message={notice} onClose={() => setNotice(null)} />;
}
