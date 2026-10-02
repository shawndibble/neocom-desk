/**
 * "Open Neocom Desk" from a **Shared Appraisal**: the live Appraisal tab, at
 * the share's Trade Hub and Price Percent, with its pile already pasted in.
 *
 * The share travels as `?share=<id>` and is re-read on arrival, so it
 * survives the login a visitor with no Character goes through first (SSO is a
 * full page navigation, which router state does not survive). Hub and percent
 * ride `?hub=` and `?percent=`, per-visit overrides that never rewrite the
 * visitor's own synced settings.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MARKET_TABS } from '@/app/pageTabs';
import {
  appraisalSnapshotPasteText,
  parseAppraisalSnapshot,
} from '@/engine/market/appraisalSnapshot';
import type { OpenInApp } from '@/features/share/ShareShell';
import { loadShare } from '@/features/share/shareStore';
import { tabPath } from '@/lib/pageTabs';
import type { AppraisalShareView } from './appraisalShareData';
import { PRICE_PERCENT_PARAM } from './pricePercent';

export const SHARE_PARAM = 'share';

export function sharedAppraisalOpenInApp(view: AppraisalShareView, shareId: string): OpenInApp {
  const query = new URLSearchParams({
    hub: view.hub.id,
    [PRICE_PERCENT_PARAM]: String(view.pricePercent),
    [SHARE_PARAM]: shareId,
  }).toString();
  return { path: `${tabPath(MARKET_TABS, 'appraisal')}?${query}` };
}

/**
 * Reads `?share=` once, strips it from the URL (a reload or a copied address
 * must not re-paste over whatever the pilot has since typed), and hands the
 * share's paste text to `onSeed`. A dead or unreadable share seeds nothing —
 * the share page itself is where that gets explained.
 */
export function useSharedAppraisalSeed(onSeed: (text: string) => void): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const shareId = searchParams.get(SHARE_PARAM);
  const latestOnSeed = useRef(onSeed);
  useEffect(() => {
    latestOnSeed.current = onSeed;
  });
  // Not a cancellation flag: stripping the param re-runs this effect, and its
  // cleanup must not drop the load it just started.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (shareId === null || handled.current === shareId) return;
    handled.current = shareId;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(SHARE_PARAM);
        return next;
      },
      { replace: true }
    );
    void loadShare(shareId).then((result) => {
      if (!result.ok || result.share.type !== 'appraisal') return;
      const snapshot = parseAppraisalSnapshot(result.share.payload);
      if (snapshot !== null) latestOnSeed.current(appraisalSnapshotPasteText(snapshot));
    });
  }, [shareId, setSearchParams]);
}
