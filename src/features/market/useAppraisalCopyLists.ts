import { useEffect, useMemo, useState } from 'react';
import { subtractOwned } from '@/engine/market/appraisalOwned';
import { appraisalSellGroups } from '@/engine/market/appraisalSellGroups';
import { writeToClipboard } from '@/lib/clipboard';
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

export function useAppraisalCopyLists({
  result,
  owned,
}: {
  result: AppraisalController['result'];
  owned: ReadonlyMap<number, number> | null;
}) {
  const [copied, setCopied] = useState<{ list: CopyList; count: number } | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const sellGroups = useMemo(
    () => (result === null ? null : appraisalSellGroups(result.appraisal)),
    [result]
  );

  const multibuyItems = useMemo(() => {
    const items = result?.appraisal.items ?? [];
    return owned ? subtractOwned(items, owned) : items;
  }, [result, owned]);

  /** Each list's items and clipboard text; an empty list has no text and its menu item is disabled. */
  const copyLists: Record<CopyList, { count: number; text: string }> = {
    sellNow: copyListOf(sellGroups?.sellNow ?? [], appraisalMultibuyText),
    list: copyListOf(sellGroups?.list ?? [], appraisalSellListText),
    refine: copyListOf(sellGroups?.refine ?? [], appraisalMultibuyText),
    multibuy: copyListOf(multibuyItems, appraisalMultibuyText),
  };

  async function handleCopy(list: CopyList) {
    const { count, text } = copyLists[list];
    if (text === '') return;
    setCopied(null);
    try {
      await writeToClipboard(text);
      setCopied({ list, count });
    } catch {
      // Nothing was copied, so no confirmation either.
    }
  }

  return { copied, copyLists, handleCopy };
}
