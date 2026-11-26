import { useEffect, useRef, useState } from 'react';
import { ORDER_BOOK_FANOUT_CONCURRENCY } from './orderBook';
import { loadOrderBookView, type OrderBookLocation } from './orderBookView';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { CompareSetItem } from './compareSet';
import type { OrderBookSummary } from '@/engine/market/orderBook';

export interface CompareRow {
  typeId: number;
  itemName: string;
  loading: boolean;
  summary: OrderBookSummary | null;
}

export interface UseCompareRowsArgs {
  items: readonly CompareSetItem[];
  enabled: boolean;
  location: OrderBookLocation;
  refreshTick: number;
}

export function useCompareRows({
  items,
  enabled,
  location,
  refreshTick,
}: UseCompareRowsArgs): CompareRow[] {
  const [rows, setRows] = useState<CompareRow[]>([]);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const itemsKey = items.map((item) => item.typeId).join(',');

  useEffect(() => {
    const currentItems = itemsRef.current;
    if (!enabled || currentItems.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(
      currentItems.map((item) => ({
        typeId: item.typeId,
        itemName: item.itemName,
        loading: true,
        summary: null,
      }))
    );
    async function loadRow(item: CompareSetItem): Promise<CompareRow> {
      const view = await loadOrderBookView(item.typeId, location);
      return {
        typeId: item.typeId,
        itemName: item.itemName,
        loading: false,
        summary: view.status === 'failed' ? null : view.summary,
      };
    }
    const resolvedRows: CompareRow[] = new Array<CompareRow>(currentItems.length);
    void mapWithConcurrencyLimit(
      currentItems.map((item, index) => ({ item, index })),
      ORDER_BOOK_FANOUT_CONCURRENCY,
      async ({ item, index }) => {
        if (cancelled) return;
        resolvedRows[index] = await loadRow(item);
      }
    ).then(() => {
      if (!cancelled) setRows(resolvedRows);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, itemsKey, location, refreshTick]);

  return rows;
}
