import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Toast } from '@/components/ui/Toast';
import type { PasteDestination } from '@/engine/import/pasteDestination';
import { FITTINGS_PATH } from '@/features/fittings/fittingRoutes';
import { tabPath } from '@/lib/pageTabs';
import {
  isTypingTarget,
  OVERLAY_SELECTOR,
  type FittingLoadState,
  type MarketAppraiseState,
} from '@/lib/shortcuts';
import { MARKET_TABS } from './pageTabs';

/** Long enough to read and reach for, short enough not to linger over the page. */
const OFFER_MS = 8000;

/** Per destination: the toast's words, and where its button goes with the paste. */
const DESTINATIONS: Record<
  PasteDestination,
  { messageKey: string; actionKey: string; to: (text: string) => [string, { state: unknown }] }
> = {
  fitting: {
    messageKey: 'pasteRouter.fitting',
    actionKey: 'pasteRouter.openFitting',
    to: (text) => [FITTINGS_PATH, { state: { fittingLoadText: text } satisfies FittingLoadState }],
  },
  appraisal: {
    messageKey: 'pasteRouter.appraisal',
    actionKey: 'pasteRouter.openAppraisal',
    to: (text) => [
      tabPath(MARKET_TABS, 'appraisal'),
      { state: { appraiseText: text } satisfies MarketAppraiseState },
    ],
  },
};

interface Offer {
  destination: PasteDestination;
  text: string;
}

/**
 * Classifies a paste off the critical path: the parsers and the market
 * catalogue load on the first page-level paste, not with the signed-in shell.
 */
async function classifyPaste(text: string): Promise<PasteDestination | null> {
  const [{ pasteDestination }, { loadAppraisalCatalogue }, { loadHullNames }] = await Promise.all([
    import('@/engine/import/pasteDestination'),
    import('@/features/market/appraisalData'),
    import('@/features/fittings/hullNames'),
  ]);
  const [catalogue, hullNames] = await Promise.all([loadAppraisalCatalogue(), loadHullNames()]);
  return pasteDestination(text, { catalogue, hullNames });
}

/**
 * The app-wide paste router: Ctrl+V / Cmd+V anywhere on a page — not into a
 * field — with an EFT fit or an item list on the clipboard offers to open it
 * in Fittings or the Appraisal. An offer, not a jump: the pilot may have
 * pasted by accident, or be mid-edit on the page they're on.
 *
 * Mounted once from `Layout`. Steps aside for a focused field and for any
 * open overlay (a dialog's own import box handles its own paste), same as
 * the global keyboard shortcuts.
 */
export function GlobalPasteRouter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  // Only the latest paste may raise an offer, whichever classifies first.
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
          if (id !== latestPaste.current) return;
          setOffer(destination === null ? null : { destination, text });
        })
        // No catalogue (offline, first visit) means no offer — the pilot can
        // still paste into Fittings' Load or the Appraisal box by hand.
        .catch(() => undefined);
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (offer === null) return;
    const timer = setTimeout(() => setOffer(null), OFFER_MS);
    return () => clearTimeout(timer);
  }, [offer]);

  if (offer === null) return null;

  const { messageKey, actionKey, to } = DESTINATIONS[offer.destination];
  const { text } = offer;
  return (
    <Toast
      message={t(messageKey)}
      action={{
        label: t(actionKey),
        onAction: () => {
          setOffer(null);
          void navigate(...to(text));
        },
      }}
    />
  );
}
