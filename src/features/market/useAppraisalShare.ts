import { useState } from 'react';
import {
  appraisalSnapshotReuseKey,
  buildAppraisalSnapshot,
} from '@/engine/market/appraisalSnapshot';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { writeToClipboard } from '@/lib/clipboard';
import type { TradeHub } from '@/market/hubs';
import type { AppraisalController } from './useAppraisal';

/**
 * The Share button's progress. `manual` is a link that was stored but could
 * not be copied: the save took long enough that the browser no longer counts
 * the copy as part of the click (Safari is strict about this), so the link is
 * shown for a second, in-gesture copy instead of being lost.
 */
export type ShareState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'failed' }
  | { status: 'copied'; url: string }
  | { status: 'manual'; url: string };

export function useAppraisalShare({
  result,
  hub,
  pricePercent,
  characterId,
}: {
  result: AppraisalController['result'];
  hub: TradeHub;
  pricePercent: number;
  characterId: number | null;
}) {
  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  // A link belongs to the result it was made from; a new appraisal drops it.
  const [shareResult, setShareResult] = useState(result);
  if (result !== shareResult) {
    setShareResult(result);
    setShare({ status: 'idle' });
  }

  /**
   * Stores the appraisal as it stands — prices included — and copies its short
   * `/s/<id>` link. The same appraisal shared again gets the same link, and
   * a failed save copies nothing.
   */
  async function handleShare() {
    if (!result || characterId === null || share.status === 'saving') return;
    const snapshot = buildAppraisalSnapshot({
      hub: hub.id,
      pricePercent,
      generatedAt: Math.floor(Date.now() / 1000),
      items: result.appraisal.items,
    });
    if (!snapshot.ok) return; // pre-checked by the disabled state below
    const reuseKey = appraisalSnapshotReuseKey(snapshot.value);
    // A link already made copies with no await first, so it stays inside the click.
    let url = existingShareLink('appraisal', reuseKey);
    if (url === null) {
      setShare({ status: 'saving' });
      try {
        url = await createShareLink({
          type: 'appraisal',
          payload: snapshot.value,
          reuseKey,
          characterId,
        });
      } catch {
        setShare({ status: 'failed' });
        return;
      }
    }
    try {
      await writeToClipboard(url);
      setShare({ status: 'copied', url });
    } catch {
      setShare({ status: 'manual', url });
    }
  }

  async function handleCopyShareUrl(url: string) {
    try {
      await writeToClipboard(url);
      setShare({ status: 'copied', url });
    } catch {
      // Still on screen to copy by hand.
    }
  }

  const shareItemCount = result?.appraisal.items.length ?? 0;

  return { share, handleShare, handleCopyShareUrl, shareItemCount };
}
