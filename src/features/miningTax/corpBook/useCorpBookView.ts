import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PayeeRecord } from '@/db';
import { useTicker } from '@/lib/ticker';
import { useRetainedResult } from '@/lib/useRetainedResult';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
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

const linkedThisSession = new Set<string>();

interface Args {
  rows: readonly MoonMiningTaxRow[] | undefined;
  characters: readonly TrackedCharacter[];
  activeCharacterId: number | null;
  madePayments: readonly MadePayment[];
  linked?: ReadonlySet<string>;
  recorded?: readonly PayeePaymentLink[];
  payees: readonly PayeeRecord[];
  reloadKey: number | undefined;
  hiddenCorps?: ReadonlySet<number>;
}

const NONE_HIDDEN: ReadonlySet<number> = new Set();
const NO_BOOKS: LoadedCorpBook[] = [];
const NO_PRICES: ReadonlyMap<number, DatedUnitPrices> = new Map();
const NO_NAMES: ReadonlyMap<number, string> = new Map();

interface CorpLayers {
  loaded: LoadedCorpBook[];
  pricesByCorp: ReadonlyMap<number, DatedUnitPrices>;
  corpNames: ReadonlyMap<number, string>;
}

export function useCorpBookView({
  rows,
  characters,
  activeCharacterId,
  madePayments,
  payees,
  reloadKey,
  hiddenCorps = NONE_HIDDEN,
  linked,
  recorded,
}: Args): {
  view: CorpBookView | null;
  booksRead: boolean;
  booksKnown: boolean;
  reload: () => void;
  shownBooks: readonly LoadedCorpBook[];
  corpNameOf: (corporationId: number) => string;
  hiddenLeft: { corporationId: number; corpName: string }[];
} {
  const { t } = useTranslation();
  const nowMs = useTicker(MINUTE_MS);
  const [version, setVersion] = useState(0);
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

  useEffect(() => {
    if (freshLoaded === undefined || freshLoaded.length === 0 || activeCharacterId === null) return;
    let cancelled = false;
    const save = startLoad();
    void (async () => {
      const prices = await loadBookPrices(freshLoaded);
      if (cancelled) return;
      const merged = new Map([...(readRetained()?.pricesByCorp ?? NO_PRICES), ...prices]);
      patchFresh({ pricesByCorp: merged });
      save({ pricesByCorp: merged });
    })();
    return () => {
      cancelled = true;
    };
  }, [freshLoaded, activeCharacterId, startLoad, readRetained, patchFresh]);

  useEffect(() => {
    for (const book of loaded) {
      const name = corpNames.get(book.corporationId);
      if (name === undefined) continue;
      const corporation = { corporationId: book.corporationId, name };
      for (const found of payeesOfBookCorporation(payees, corporation)) {
        if (!found.link || linkedThisSession.has(found.id)) continue;
        linkedThisSession.add(found.id);
        void linkPayeeToCorporation(found.id, book.corporationId).catch(() => {
          linkedThisSession.delete(found.id);
        });
      }
    }
  }, [loaded, corpNames, payees]);

  useEffect(() => {
    if (rows === undefined || loaded.length === 0) return;
    void teachRefinerySystems(
      loaded,
      rows.map((r) => r.entry)
    );
  }, [rows, loaded]);

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
              ...(recorded ? { recorded } : {}),
              characterNames: new Map(characters.map((c) => [c.characterId, c.characterName])),
              now: new Date(nowMs).toISOString(),
            },
            (corp) => t('miningTax.corpBook.payeeName', { corp })
          ),
    [
      rows,
      shownBooks,
      pricesByCorp,
      corpNames,
      payees,
      madePayments,
      linked,
      recorded,
      characters,
      nowMs,
      t,
    ]
  );
  const reload = useCallback(() => setVersion((v) => v + 1), []);
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
