import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseDscanSnapshot } from '@/engine/pilotList/dscanSnapshot';
import { SHARE_PARAM } from '@/features/market/sharedAppraisalSeed';
import type { OpenInApp } from '@/features/share/ShareShell';
import { loadShare } from '@/features/share/shareStore';

export function sharedDscanOpenInApp(shareId: string): OpenInApp {
  return { path: `/travel/pilot?${new URLSearchParams({ [SHARE_PARAM]: shareId }).toString()}` };
}

export function useSharedDscanSeed(onSeed: (text: string) => void): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const shareId = searchParams.get(SHARE_PARAM);
  const latestOnSeed = useRef(onSeed);
  useEffect(() => {
    latestOnSeed.current = onSeed;
  });
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
      if (!result.ok || result.share.type !== 'dscan') return;
      const scan = parseDscanSnapshot(result.share.payload);
      if (scan !== null) latestOnSeed.current(scan.text);
    });
  }, [shareId, setSearchParams]);
}
