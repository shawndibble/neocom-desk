import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefineBasis } from '@/engine/market/appraisal';
import { subtractOwned } from '@/engine/market/appraisalOwned';
import {
  appraisalSellGroups,
  type AppraisalTurnInLookup,
} from '@/engine/market/appraisalSellGroups';
import { groupTurnInPile } from '@/engine/market/turnInPile';
import { traderPlace, turnInGroupMultibuy } from '@/features/campaigns/turnInContent';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';
import { writeToClipboardLater } from '@/lib/clipboard';
import { appraisalMultibuyText } from './appraisalMultibuyText';
import { appraisalSellListText } from './appraisalSellListText';
import type { AppraisalController } from './useAppraisal';

export type CopyList = 'sellNow' | 'list' | 'refine' | 'turnIn' | 'multibuy';

export const COPY_LISTS: readonly CopyList[] = ['sellNow', 'list', 'refine', 'turnIn', 'multibuy'];

export interface TraderCopyList {
  key: string;
  label: string;
  count: number;
  text: string;
}

export type CopyListTexts = Record<CopyList, { count: number; text: string }> & {
  traders: TraderCopyList[];
};

function copyListOf<T>(items: readonly T[], toText: (items: readonly T[]) => string) {
  const text = toText(items);
  return { count: text === '' ? 0 : text.split('\n').length, text };
}

type Result = AppraisalController['result'];

function listsFor(
  result: Result,
  owned: ReadonlyMap<number, number> | null,
  refineBasis: RefineBasis,
  turnIn: AppraisalTurnInLookup<TurnInOfferDetail> | null
): CopyListTexts {
  const sellGroups =
    result === null ? null : appraisalSellGroups(result.appraisal, refineBasis, turnIn);
  const items = result?.appraisal.items ?? [];
  const multibuyItems = owned ? subtractOwned(items, owned) : items;
  const traders = traderListsFor(sellGroups?.turnIn ?? [], turnIn);
  return {
    sellNow: copyListOf(sellGroups?.sellNow ?? [], appraisalMultibuyText),
    list: copyListOf(sellGroups?.list ?? [], appraisalSellListText),
    refine: copyListOf(sellGroups?.refine ?? [], appraisalMultibuyText),
    turnIn: {
      count: traders.reduce((sum, trader) => sum + trader.count, 0),
      text: traders.map((trader) => trader.text).join('\n'),
    },
    multibuy: copyListOf(multibuyItems, appraisalMultibuyText),
    traders,
  };
}

function traderListsFor(
  items: readonly { typeId: number; name: string; quantity: number }[],
  turnIn: AppraisalTurnInLookup<TurnInOfferDetail> | null
): TraderCopyList[] {
  if (turnIn === null) return [];
  const pile = groupTurnInPile(
    items.flatMap((item) => {
      const offer = turnIn.offerFor(item.typeId);
      return offer === null
        ? []
        : [
            {
              name: item.name,
              quantity: item.quantity,
              offer,
              contributed: turnIn.contributedTo?.(offer.objectiveId) ?? undefined,
            },
          ];
    })
  );
  return pile.groups.map((group) => ({
    key: group.key,
    label: traderPlace(group.traderName, group.lines[0]?.offer.systemName ?? null),
    ...copyListOf(group.lines, () => turnInGroupMultibuy(group)),
  }));
}

function textOf(lists: CopyListTexts, list: CopyList, trader?: string) {
  if (list !== 'turnIn' || trader === undefined) return lists[list];
  return lists.traders.find((entry) => entry.key === trader) ?? { count: 0, text: '' };
}

export function useAppraisalCopyLists({
  result,
  owned,
  settleLive,
  refineBasis,
  turnIn = null,
}: {
  result: Result;
  owned: ReadonlyMap<number, number> | null;
  refineBasis: RefineBasis;
  settleLive: AppraisalController['settleLive'];
  turnIn?: AppraisalTurnInLookup<TurnInOfferDetail> | null;
}) {
  const [copied, setCopied] = useState<{ list: CopyList; count: number } | null>(null);
  const [pending, setPending] = useState<CopyList | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLists = useMemo(
    () => listsFor(result, owned, refineBasis, turnIn),
    [result, owned, refineBasis, turnIn]
  );

  async function handleCopy(list: CopyList, trader?: string) {
    if (textOf(copyLists, list, trader).text === '' || busy.current) return;
    busy.current = true;
    setPending(list);
    setCopied(null);
    try {
      let count = 0;
      await writeToClipboardLater(
        (async () => {
          const settled = (await settleLive()) ?? result;
          const lists =
            settled === result ? copyLists : listsFor(settled, owned, refineBasis, turnIn);
          const copy = textOf(lists, list, trader);
          if (copy.text === '') throw new Error('nothing to copy');
          count = copy.count;
          return copy.text;
        })()
      );
      setCopied({ list, count });
    } catch {
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return { copied, pending, copyLists, handleCopy };
}
