import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PasteDestination } from '@/engine/import/pasteDestination';
import { FITTINGS_PATH } from '@/features/fittings/fittingRoutes';
import { tabPath } from '@/lib/pageTabs';
import {
  isTypingTarget,
  OVERLAY_SELECTOR,
  type FittingLoadState,
  type MarketAppraiseState,
  type SkillPlanImportState,
} from '@/lib/shortcuts';
import { MARKET_TABS } from './pageTabs';

const SKILL_PLANS_PATH = '/skills/plans';

/** Per destination: where the paste goes, carrying its text in route state. */
const DESTINATIONS: Record<PasteDestination, (text: string) => [string, { state: unknown }]> = {
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
 * Fittings or the Appraisal straight away, and a skill plan opens the Skills
 * planner with the import ready. No confirm step: a mistaken paste
 * is one Back away, and every page keeps its own state across the trip.
 *
 * Mounted once from `Layout`. Steps aside for a focused field and for any
 * open overlay (a dialog's own import box handles its own paste), same as
 * the global keyboard shortcuts.
 */
export function GlobalPasteRouter() {
  const navigate = useNavigate();
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
          void navigate(...DESTINATIONS[destination](text));
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
