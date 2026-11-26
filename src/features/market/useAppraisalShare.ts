import { useState } from 'react';
import {
  appraisalSnapshotReuseKey,
  buildAppraisalSnapshot,
} from '@/engine/market/appraisalSnapshot';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { writeToClipboard } from '@/lib/clipboard';
import type { AppraisalItem } from '@/engine/market/appraisal';
import type { TradeHub } from '@/market/hubs';
import type { AppraisalController } from './useAppraisal';
import { useRefineMineralNames } from './useRefineMineralNames';

const NO_ITEMS: readonly AppraisalItem[] = [];

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
  const mineralNames = useRefineMineralNames(result?.appraisal.items ?? NO_ITEMS);
  const [shareResult, setShareResult] = useState(result);
  if (result !== shareResult) {
    setShareResult(result);
    setShare({ status: 'idle' });
  }

  async function handleShare() {
    if (!result || characterId === null || share.status === 'saving') return;
    const snapshot = buildAppraisalSnapshot({
      hub: hub.id,
      pricePercent,
      generatedAt: Math.floor(Date.now() / 1000),
      items: result.appraisal.items,
      refining: result.refining && {
        yieldRate: result.refining.stationRate,
        taxRate: result.refining.taxRate,
      },
      mineralNames,
    });
    if (!snapshot.ok) return;
    const reuseKey = appraisalSnapshotReuseKey(snapshot.value);
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
    } catch {}
  }

  const shareItemCount = result?.appraisal.items.length ?? 0;

  return { share, handleShare, handleCopyShareUrl, shareItemCount };
}
