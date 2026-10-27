/**
 * "Open Neocom Desk" from a **Shared D-Scan**: the live Pilot Lookup with the
 * scan already pasted in. Same shape as the Shared Appraisal's seed
 * (`features/market/sharedAppraisalSeed.ts`): the share travels as
 * `?share=<id>` and is re-read on arrival, so it survives the login a visitor
 * with no Character goes through first.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseDscanSnapshot } from '@/engine/pilotList/dscanSnapshot';
import { SHARE_PARAM } from '@/features/market/sharedAppraisalSeed';
import type { OpenInApp } from '@/features/share/ShareShell';
import { loadShare } from '@/features/share/shareStore';

export function sharedDscanOpenInApp(shareId: string): OpenInApp {
  return { path: `/travel/pilot?${new URLSearchParams({ [SHARE_PARAM]: shareId }).toString()}` };
}

/**
 * Reads `?share=` once, strips it from the URL (a reload must not re-paste
 * over what the pilot has since done), and hands the stored scan text to
 * `onSeed`. A dead or unreadable share seeds nothing — the share page itself
 * is where that gets explained.
 */
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
