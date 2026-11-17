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
import { payeesOfBookCorporation } from '@/engine/miningTax/payeeCorporation';
import { linkPayeeToCorporation } from '../payees';

/** Payees linked as a book's corporation this session (`linkPayeeToCorporation`). */
const linkedThisSession = new Set<string>();
import { hiddenLeftBooksOf, withoutHiddenLeft } from './leftCorpBooks';

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
  /** Corporations the member left and chose to stop showing: their books are left out of the view. */
  hiddenCorps?: ReadonlySet<number>;
}

const NONE_HIDDEN: ReadonlySet<number> = new Set();

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
  hiddenCorps = NONE_HIDDEN,
}: Args): {
  view: CorpBookView | null;
  reload: () => void;
  /** The loaded books still in view (hidden left ones removed), and each corporation's name. */
  shownBooks: readonly LoadedCorpBook[];
  corpNameOf: (corporationId: number) => string;
  /** Left books the member hid, for the line that shows them again. */
  hiddenLeft: { corporationId: number; corpName: string }[];
} {
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

  // A Payee that is a book's corporation but is missing its link on this device (named exactly as
  // it, or carrying its id with no kind) gets the link, synced, so every device reads the same.
  useEffect(() => {
    for (const book of loaded) {
      const name = corpNames.get(book.corporationId);
      if (name === undefined) continue;
      const corporation = { corporationId: book.corporationId, name };
      for (const found of payeesOfBookCorporation(payees, corporation)) {
        // Once a session: the snapshot's copy stays unlinked until the ledger reloads.
        if (!found.link || linkedThisSession.has(found.id)) continue;
        linkedThisSession.add(found.id);
        void linkPayeeToCorporation(found.id, book.corporationId).catch(() => {
          linkedThisSession.delete(found.id);
        });
      }
    }
  }, [loaded, corpNames, payees]);

  // The member's own ledger places the moon owner refineries the book cannot (#4650).
  useEffect(() => {
    if (rows === undefined || loaded.length === 0) return;
    void teachRefinerySystems(
      loaded,
      rows.map((r) => r.entry)
    );
  }, [rows, loaded]);

  // The one place a hidden left book is filtered: its rows, Conflicts and attention items all come
  // from the view built here.
  const shownBooks = useMemo(() => withoutHiddenLeft(loaded, hiddenCorps), [loaded, hiddenCorps]);
  const corpNameOf = useCallback(
    (corporationId: number) => corpNames.get(corporationId) ?? `#${corporationId}`,
    [corpNames]
  );
  const hiddenLeft = useMemo(
    () => hiddenLeftBooksOf(loaded, hiddenCorps, corpNameOf),
    [loaded, hiddenCorps, corpNameOf]
  );

  const view = useMemo(
    () =>
      rows === undefined
        ? null
        : buildCorpBookView(
            {
              rows,
              loaded: shownBooks,
              pricesByCorp,
              corpNames,
              payees,
              made: madePayments,
              characterNames: new Map(characters.map((c) => [c.characterId, c.characterName])),
              now: new Date(nowMs).toISOString(),
            },
            (corp) => t('miningTax.corpBook.payeeName', { corp })
          ),
    [rows, shownBooks, pricesByCorp, corpNames, payees, madePayments, characters, nowMs, t]
  );
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { view, reload, shownBooks, corpNameOf, hiddenLeft };
}
