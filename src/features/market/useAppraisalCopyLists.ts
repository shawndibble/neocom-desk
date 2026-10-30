import { useEffect, useMemo, useState } from 'react';
import { subtractOwned } from '@/engine/market/appraisalOwned';
import { appraisalSellGroups } from '@/engine/market/appraisalSellGroups';
import { writeToClipboardLater } from '@/lib/clipboard';
import { appraisalMultibuyText } from './appraisalMultibuyText';
import { appraisalSellListText } from './appraisalSellListText';
import type { AppraisalController } from './useAppraisal';

export type CopyList = 'sellNow' | 'list' | 'refine' | 'multibuy';

/** Menu order: the three ways out of the pile, then the way in. */
export const COPY_LISTS: readonly CopyList[] = ['sellNow', 'list', 'refine', 'multibuy'];

/** A copy list's line count and text; an empty one has neither, and its menu item is disabled. */
function copyListOf<T>(items: readonly T[], toText: (items: readonly T[]) => string) {
  const text = toText(items);
  return { count: text === '' ? 0 : text.split('\n').length, text };
}

type Result = AppraisalController['result'];

/** Each list's items and clipboard text for `result`; an empty list has no text and its menu item is disabled. */
function listsFor(
  result: Result,
  owned: ReadonlyMap<number, number> | null
): Record<CopyList, { count: number; text: string }> {
  const sellGroups = result === null ? null : appraisalSellGroups(result.appraisal);
  const items = result?.appraisal.items ?? [];
  const multibuyItems = owned ? subtractOwned(items, owned) : items;
  return {
    sellNow: copyListOf(sellGroups?.sellNow ?? [], appraisalMultibuyText),
    list: copyListOf(sellGroups?.list ?? [], appraisalSellListText),
    refine: copyListOf(sellGroups?.refine ?? [], appraisalMultibuyText),
    multibuy: copyListOf(multibuyItems, appraisalMultibuyText),
  };
}

export function useAppraisalCopyLists({
  result,
  owned,
  settleLive,
}: {
  result: Result;
  owned: ReadonlyMap<number, number> | null;
  /** Resolves with the result once every row has settled on its live book. */
  settleLive: AppraisalController['settleLive'];
}) {
  const [copied, setCopied] = useState<{ list: CopyList; count: number } | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLists = useMemo(() => listsFor(result, owned), [result, owned]);

  async function handleCopy(list: CopyList) {
    if (copyLists[list].text === '') return;
    setCopied(null);
    try {
      // A row still on its cached price is not copied: the text waits for the
      // live fetch to settle. Handed over as a promise so Safari keeps the click's activation.
      let count = 0;
      await writeToClipboardLater(
        (async () => {
          const settled = (await settleLive()) ?? result;
          const lists = settled === result ? copyLists : listsFor(settled, owned);
          if (lists[list].text === '') throw new Error('nothing to copy');
          count = lists[list].count;
          return lists[list].text;
        })()
      );
      setCopied({ list, count });
    } catch {
      // Nothing was copied, so no confirmation either.
    }
  }

  return { copied, copyLists, handleCopy };
}
