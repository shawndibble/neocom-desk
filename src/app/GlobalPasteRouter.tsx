import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { parseChatLink } from '@/engine/import/chatLink';
import type { PasteDestination } from '@/engine/import/pasteDestination';
import { ENTITY_INFO_PUSHED_STATE } from '@/features/entities/entityInfoState';
import { FITTINGS_PATH } from '@/features/fittings/fittingRoutes';
import { routeToHref } from '@/features/travel/routeSafetyLink';
import { entityInfoHref } from '@/lib/entityInfo';
import { tabPath } from '@/lib/pageTabs';
import {
  isTypingTarget,
  OVERLAY_SELECTOR,
  type FittingLoadState,
  type MarketAppraiseState,
  type PilotListState,
  type SkillPlanImportState,
} from '@/lib/shortcuts';
import { MARKET_TABS } from './pageTabs';

const SKILL_PLANS_PATH = '/skills/plans';

/** A Local list and a D-Scan share a route: Pilot Lookup reads either. */
const pilotLookup = (text: string): [string, { state: unknown }] => [
  '/pilot-lookup',
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
  fitting: (text) => [
    FITTINGS_PATH,
    { state: { fittingLoadText: text } satisfies FittingLoadState },
  ],
  appraisal: (text) => [
    tabPath(MARKET_TABS, 'appraisal'),
    { state: { appraiseText: text } satisfies MarketAppraiseState },
  ],
  // An item or ship opens its Item Detail over the current page (the same
  // `?info=type-<id>` a name link makes); a system opens Route Safety.
  chatLink: (text, here) => {
    const link = parseChatLink(text);
    // The detector already found a link; null only means "stay on this page".
    if (link === null) return [`${here.pathname}${here.search}`, { state: null }];
    if (link.kind === 'system') return [routeToHref(link.id), { state: null }];
    return [
      entityInfoHref(here, { kind: 'type', id: link.id }),
      { state: ENTITY_INFO_PUSHED_STATE },
    ];
  },
  skillPlan: (text) => [
    SKILL_PLANS_PATH,
    { state: { skillPlanImportText: text } satisfies SkillPlanImportState },
  ],
  pilotList: pilotLookup,
  dscan: pilotLookup,
};

/**
 * Classifies a paste off the critical path: the parsers and the market
 * catalogue load on the first page-level paste, not with the signed-in shell.
 */
async function classifyPaste(text: string): Promise<PasteDestination | null> {
  const [
    { pasteDestination },
    { loadAppraisalCatalogue },
    { loadHullNames },
    { loadSkillNameMap },
  ] = await Promise.all([
    import('@/engine/import/pasteDestination'),
    import('@/features/market/appraisalData'),
    import('@/features/fittings/hullNames'),
    import('@/features/skills/typeCatalog'),
  ]);
  const [catalogue, hullNames, skillByName] = await Promise.all([
    loadAppraisalCatalogue(),
    loadHullNames(),
    // A skill catalogue that won't load costs only the skill-plan route.
    loadSkillNameMap().catch(() => new Map<string, { typeID: number }>()),
  ]);
  return pasteDestination(text, { catalogue, hullNames, skillByName });
}

/**
 * The app-wide paste router: Ctrl+V / Cmd+V anywhere on a page — not into a
 * field — with an EFT fit or an item list on the clipboard opens it in
 * Fittings or the Appraisal straight away. No confirm step: a mistaken paste
 * is one Back away, and every page keeps its own state across the trip.
 *
 * Mounted once from `Layout`. Steps aside for a focused field and for any
 * open overlay (a dialog's own import box handles its own paste), same as
 * the global keyboard shortcuts.
 */
export function GlobalPasteRouter() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });
  // Only the latest paste may navigate, whichever classifies first.
  const latestPaste = useRef(0);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (text.trim() === '') return;

      const id = ++latestPaste.current;
      classifyPaste(text)
        .then((destination) => {
          if (id !== latestPaste.current || destination === null) return;
          void navigate(...DESTINATIONS[destination](text, locationRef.current));
        })
        // No catalogue (offline, first visit) means no jump — the pilot can
        // still paste into Fittings' Load or the Appraisal box by hand.
        .catch(() => undefined);
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [navigate]);

  return null;
}
