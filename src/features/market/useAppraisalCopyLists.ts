import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefineBasis } from '@/engine/market/appraisal';
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
  owned: ReadonlyMap<number, number> | null,
  refineBasis: RefineBasis
): Record<CopyList, { count: number; text: string }> {
  const sellGroups = result === null ? null : appraisalSellGroups(result.appraisal, refineBasis);
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
  refineBasis = 'buy',
}: {
  result: Result;
  owned: ReadonlyMap<number, number> | null;
  /** The remembered price basis, which decides what counts as "refine" in the copy lists. */
  refineBasis?: RefineBasis;
  /** Resolves with the result once every row has settled on its live book. */
  settleLive: AppraisalController['settleLive'];
}) {
  const [copied, setCopied] = useState<{ list: CopyList; count: number } | null>(null);
  // The list whose copy is waiting on the live fetch: a second click meanwhile is ignored.
  const [pending, setPending] = useState<CopyList | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLists = useMemo(
    () => listsFor(result, owned, refineBasis),
    [result, owned, refineBasis]
  );

  async function handleCopy(list: CopyList) {
    if (copyLists[list].text === '' || busy.current) return;
    busy.current = true;
    setPending(list);
    setCopied(null);
    try {
      // A row still on its cached price is not copied: the text waits for the
      // live fetch to settle. Handed over as a promise so Safari keeps the click's activation.
      let count = 0;
      await writeToClipboardLater(
        (async () => {
          const settled = (await settleLive()) ?? result;
          const lists = settled === result ? copyLists : listsFor(settled, owned, refineBasis);
          if (lists[list].text === '') throw new Error('nothing to copy');
          count = lists[list].count;
          return lists[list].text;
        })()
      );
      setCopied({ list, count });
    } catch {
      // Nothing was copied, so no confirmation either.
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return { copied, pending, copyLists, handleCopy };
}
