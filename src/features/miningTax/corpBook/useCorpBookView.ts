import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PayeeRecord } from '@/db';
import { useTicker } from '@/lib/ticker';
import { useRetainedResult } from '@/lib/useRetainedResult';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import type { MadePayment } from '../paymentLinks';
import type { MoonMiningTaxRow, TrackedCharacter } from '../snapshot';
import { teachRefinerySystems, type LoadedCorpBook } from './corpBookStore';
import {
  loadBookPrices,
  loadCorpNames,
  readTrackedCorpBooks,
  withStoredBooks,
} from './corpBookSources';
import { buildCorpBookView, type CorpBookView } from './corpBookView';
import { MINUTE_MS } from '@/lib/age';
import { payeesOfBookCorporation } from '@/engine/miningTax/payeeCorporation';
import { linkPayeeToCorporation } from '../payees';
import { hiddenLeftBooksOf, withoutHiddenLeft } from './leftCorpBooks';

/** Payees linked as a book's corporation this session (`linkPayeeToCorporation`). */
const linkedThisSession = new Set<string>();

interface Args {
  /** The ledger as loaded; undefined until it has. */
  rows: readonly MoonMiningTaxRow[] | undefined;
  characters: readonly TrackedCharacter[];
  activeCharacterId: number | null;
  madePayments: readonly MadePayment[];
  /** The Made Payments links hold: never a donation in flight to a book too. */
  linked?: ReadonlySet<string>;
  /** The member's stored Payees, to connect the one that is a book's corporation. */
  payees: readonly PayeeRecord[];
  /** Changes whenever the ledger was reloaded, so the books are read again with it. */
  reloadKey: number | undefined;
  /** Corporations the member left and chose to stop showing: their books are left out of the view. */
  hiddenCorps?: ReadonlySet<number>;
}

const NONE_HIDDEN: ReadonlySet<number> = new Set();
const NO_BOOKS: LoadedCorpBook[] = [];
const NO_PRICES: ReadonlyMap<number, DatedUnitPrices> = new Map();
const NO_NAMES: ReadonlyMap<number, string> = new Map();

/** What the books' loads last produced, kept so the tab opens on it (`useRetainedResult`). */
interface CorpLayers {
  loaded: LoadedCorpBook[];
  pricesByCorp: ReadonlyMap<number, DatedUnitPrices>;
  corpNames: ReadonlyMap<number, string>;
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
  hiddenCorps = NONE_HIDDEN,
  linked,
}: Args): {
  view: CorpBookView | null;
  /** This mount's own read of the books has landed; until then `view` is built from the last good copy. */
  booksRead: boolean;
  /**
   * Whether which Corp Tax Books the member is in, and their corporations' names, are known: this
   * mount's read, or the last good copy. A Payee that is a book's corporation can only be told
   * once they are, so a card for it must not show before.
   */
  booksKnown: boolean;
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
  // This mount's own loads, tagged with the roster they were read for (a roster change must not
  // keep showing the old one's books). Until they land the last good ones stand in, so the first
  // frame (and an offline one) already has the books instead of none the load then adds.
  const roster = characters.map((c) => c.characterId).join(',');
  const [loadedFor, setLoadedFor] = useState<{ roster: string } & Partial<CorpLayers>>({ roster });
  const fresh = loadedFor.roster === roster ? loadedFor : null;
  const patchFresh = useCallback(
    (patch: Partial<CorpLayers>) =>
      setLoadedFor((prev) => ({ ...(prev.roster === roster ? prev : { roster }), ...patch })),
    [roster]
  );
  const { read: readRetained, startLoad } = useRetainedResult<CorpLayers>(
    'moonMiningTaxCorpBooks',
    roster
  );
  const retained = readRetained();
  const freshLoaded = fresh?.loaded;
  const loaded = freshLoaded ?? retained?.loaded ?? NO_BOOKS;
  const pricesByCorp = fresh?.pricesByCorp ?? retained?.pricesByCorp ?? NO_PRICES;
  const corpNames = fresh?.corpNames ?? retained?.corpNames ?? NO_NAMES;
  const loadedLedger = rows !== undefined;

  useEffect(() => {
    if (!loadedLedger) return;
    let cancelled = false;
    const save = startLoad();
    void (async () => {
      const read = await readTrackedCorpBooks();
      if (cancelled) return;
      // A book that could not be read this time keeps its last good copy.
      const books = withStoredBooks(read, readRetained()?.loaded ?? NO_BOOKS);
      save({ loaded: books });
      if (books.length === 0) {
        patchFresh({ loaded: books, pricesByCorp: new Map(), corpNames: new Map() });
        save({ pricesByCorp: new Map(), corpNames: new Map() });
        return;
      }
      patchFresh({ loaded: books });
      const names = await loadCorpNames(books);
      if (cancelled) return;
      const merged = new Map([...(readRetained()?.corpNames ?? NO_NAMES), ...names]);
      patchFresh({ corpNames: merged });
      save({ corpNames: merged });
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedLedger, reloadKey, version, startLoad, readRetained, patchFresh]);

  // Prices for each book at its own hub and Ore Form, for the days it observed.
  useEffect(() => {
    if (freshLoaded === undefined || freshLoaded.length === 0 || activeCharacterId === null) return;
    let cancelled = false;
    const save = startLoad();
    void (async () => {
      const prices = await loadBookPrices(freshLoaded);
      if (cancelled) return;
      // A book whose prices failed to load keeps the ones it had.
      const merged = new Map([...(readRetained()?.pricesByCorp ?? NO_PRICES), ...prices]);
      patchFresh({ pricesByCorp: merged });
      save({ pricesByCorp: merged });
    })();
    return () => {
      cancelled = true;
    };
  }, [freshLoaded, activeCharacterId, startLoad, readRetained, patchFresh]);

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
              linked,
              characterNames: new Map(characters.map((c) => [c.characterId, c.characterName])),
              now: new Date(nowMs).toISOString(),
            },
            (corp) => t('miningTax.corpBook.payeeName', { corp })
          ),
    [rows, shownBooks, pricesByCorp, corpNames, payees, madePayments, linked, characters, nowMs, t]
  );
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  // Names that failed to resolve are settled too (`loadCorpNames` is empty then): never a wait forever.
  const booksKnown =
    (freshLoaded !== undefined || retained?.loaded !== undefined) &&
    (fresh?.corpNames !== undefined || loaded.every((book) => corpNames.has(book.corporationId)));
  return {
    view,
    booksRead: freshLoaded !== undefined,
    booksKnown,
    reload,
    shownBooks,
    corpNameOf,
    hiddenLeft,
  };
}
