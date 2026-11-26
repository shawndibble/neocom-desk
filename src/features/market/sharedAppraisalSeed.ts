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
  loadFailed: boolean;
  retrying: boolean;
  retry: () => void;
  dismiss: () => void;
}

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
  const handled = useRef<string | null>(null);
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
