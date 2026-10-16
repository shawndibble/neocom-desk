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
import { useCallback, useEffect, useRef, useState } from 'react';
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

export interface SharedAppraisalSeed {
  /** The share could not be fetched (offline, a timeout): `?share=` is still in the URL. */
  loadFailed: boolean;
  /** A `retry` is in flight; `loadFailed` stays true until it succeeds. */
  retrying: boolean;
  /** Fetches the share again. */
  retry: () => void;
  /** Gives up on the failed load: drops `?share=` so a reload does not try again. */
  dismiss: () => void;
}

/**
 * Reads `?share=` once and hands the share's paste text to `onSeed`, then
 * strips it from the URL (a reload or a copied address must not re-paste over
 * whatever the pilot has since typed). It is stripped only once the share has
 * answered: a fetch that failed (offline) keeps `?share=` so a reload or
 * `retry` can still load it, and says so through `loadFailed`. A dead or
 * unsupported share seeds nothing and is stripped — retrying cannot help, and
 * the share page itself is where that gets explained.
 */
export function useSharedAppraisalSeed(onSeed: (text: string) => void): SharedAppraisalSeed {
  const [searchParams, setSearchParams] = useSearchParams();
  const shareId = searchParams.get(SHARE_PARAM);
  const latestOnSeed = useRef(onSeed);
  useEffect(() => {
    latestOnSeed.current = onSeed;
  });
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Not a cancellation flag: stripping the param re-runs this effect, and its
  // cleanup must not drop the load it just started.
  const handled = useRef<string | null>(null);
  /** The load the pilot dismissed while it was in flight: its result is ignored. */
  const dismissed = useRef<string | null>(null);

  const strip = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(SHARE_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (shareId === null) return;
    const key = `${shareId}#${attempt}`;
    if (handled.current === key) return;
    handled.current = key;
    void loadShare(shareId).then((result) => {
      setRetrying(false);
      if (dismissed.current === key) return;
      if (!result.ok && result.reason === 'failed') {
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      if (result.ok && result.share.type === 'appraisal') {
        const snapshot = parseAppraisalSnapshot(result.share.payload);
        if (snapshot !== null) latestOnSeed.current(appraisalSnapshotPasteText(snapshot));
      }
      strip();
    });
  }, [shareId, attempt, strip]);

  // `loadFailed` stays set while the retry runs, so the notice that offered it stays mounted.
  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt((n) => n + 1);
  }, []);
  const dismiss = useCallback(() => {
    dismissed.current = handled.current;
    setLoadFailed(false);
    strip();
  }, [strip]);

  return { loadFailed, retrying, retry, dismiss };
}
