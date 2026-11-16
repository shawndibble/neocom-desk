import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PayeeRecord } from '@/db';
import { useTicker } from '@/lib/ticker';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import type { MadePayment } from '../paymentLinks';
import type { MoonMiningTaxRow, TrackedCharacter } from '../snapshot';
import { teachRefinerySystems, type LoadedCorpBook } from './corpBookStore';
import { loadBookPrices, loadCorpNames, loadTrackedCorpBooks } from './corpBookSources';
import { buildCorpBookView, type CorpBookView } from './corpBookView';
import { MINUTE_MS } from '@/lib/age';

interface Args {
  /** The ledger as loaded; undefined until it has. */
  rows: readonly MoonMiningTaxRow[] | undefined;
  characters: readonly TrackedCharacter[];
  activeCharacterId: number | null;
  madePayments: readonly MadePayment[];
  /** The member's stored Payees, to connect the one that is a book's corporation. */
  payees: readonly PayeeRecord[];
  /** Changes whenever the ledger was reloaded, so the books are read again with it. */
  reloadKey: number | undefined;
}

/**
 * Loads the Corp Tax Books of the member's corporations (D24: none, nothing
 * changes), their prices and corp names, and builds the tab's overlay. Every
 * step degrades to "no overlay": the personal ledger never waits on, or breaks
 * with, a book.
 */
export function useCorpBookView({
  rows,
  characters,
  activeCharacterId,
  madePayments,
  payees,
  reloadKey,
}: Args): { view: CorpBookView | null; reload: () => void } {
  const { t } = useTranslation();
  const nowMs = useTicker(MINUTE_MS);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<LoadedCorpBook[]>([]);
  const [pricesByCorp, setPricesByCorp] = useState<ReadonlyMap<number, DatedUnitPrices>>(new Map());
  const [corpNames, setCorpNames] = useState<ReadonlyMap<number, string>>(new Map());
  const loadedLedger = rows !== undefined;

  useEffect(() => {
    if (!loadedLedger) return;
    let cancelled = false;
    void (async () => {
      const books = await loadTrackedCorpBooks();
      if (cancelled) return;
      setLoaded(books);
      if (books.length === 0) {
        setPricesByCorp(new Map());
        return;
      }
      const names = await loadCorpNames(books);
      if (!cancelled) setCorpNames(names);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedLedger, reloadKey, version]);

  // Prices for each book at its own hub and Ore Form, for the days it observed.
  useEffect(() => {
    if (loaded.length === 0 || activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const prices = await loadBookPrices(loaded);
      if (!cancelled) setPricesByCorp(prices);
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, activeCharacterId]);

  // The member's own ledger places the moon owner refineries the book cannot (#4650).
  useEffect(() => {
    if (rows === undefined || loaded.length === 0) return;
    void teachRefinerySystems(
      loaded,
      rows.map((r) => r.entry)
    );
  }, [rows, loaded]);

  const view = useMemo(
    () =>
      rows === undefined
        ? null
        : buildCorpBookView(
            {
              rows,
              loaded,
              pricesByCorp,
              corpNames,
              payees,
              made: madePayments,
              characterNames: new Map(characters.map((c) => [c.characterId, c.characterName])),
              now: new Date(nowMs).toISOString(),
            },
            (corp) => t('miningTax.corpBook.payeeName', { corp })
          ),
    [rows, loaded, pricesByCorp, corpNames, payees, madePayments, characters, nowMs, t]
  );
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { view, reload };
}
