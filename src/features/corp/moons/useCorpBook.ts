/**
 * `/corp/moons`'s data (issue #4063): the whole Corp Tax Book read back from
 * Firestore, priced with the personal tab's loaders, joined into one
 * `BookView` (`engine/corpTaxBook/bookView.ts`), and the names the tables
 * print. Sync, the stale warning and the mining-scope prompt are
 * `useCorpTaxBook()`'s; this hook only reads and joins.
 *
 * Reads go through the officer rules, so it verifies the Character first
 * (`verifyOfficer`, access token only, ADR 0023). A reload after every edit
 * is the caller's: Firestore here is the `lite` build, with no listeners.
 *
 * `options.minerId` names the Miner whose page is open. With `CORP_BOOK_MINER_SCOPED_READ` on, the
 * book is then that Miner's read-model slice (#5258, `readMinerBookData`) instead of the whole
 * ledger; off, it is ignored and nothing changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildBookView, type BookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { groupObservedEntries } from '@/engine/corpTaxBook/observed';
import {
  learnedSystemsOf,
  officerLabelsOf,
  refineryFacts,
  structureNamesOf,
  refineryLabeler,
  type RefineryLabelSources,
} from '@/engine/corpTaxBook/refinery';
import { surveyFractions, estimateChunk, learnChunkRates } from '@/engine/corpTaxBook/extraction';
import { measurable } from '@/engine/corpTaxBook/bookView';
import { toEngineExtraction } from '@/engine/corpTaxBook/sync';
import { countedScans } from '@/engine/survey/series';
import { loadCurrentMemberIds } from '../currentMembers';
import { loadMoonNames } from '@/features/character/moonNames';
import { loadSurvey } from '@/features/survey/surveyStore';
import { loadMoonOreTypeIds, loadTypes } from '@/sde/loadSde';
import { resolveNames } from '@/features/character/names';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  hubForPayee,
  loadDatedUnitPricesByHub,
  moonOwnerPricesAtHubOnDate,
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
} from '@/features/miningTax/pricing';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { withMinerTotals, type HeaderTotals } from '@/engine/corpTaxBook/minerScope';
import {
  mergeBookData,
  readBookData,
  readMinerBookData,
  verifyOfficer,
  type BookData,
  type BookSettings,
  type OfficerVerdict,
} from '../taxBook/bookClient';
import { ALL_BOOK_PART_SET, missingBookParts, type BookPartSet } from '../taxBook/bookParts';
import { forgetObservedCopy } from '../taxBook/observedStore';
import { CORP_BOOK_MINER_SCOPED_READ } from '../taxBook/readModelSwitch';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';
import { refineryPlaceholder } from './moonsFormat';
import { MINUTE_MS } from '@/lib/age';

export interface BookNames {
  character: (id: number) => string;
  /** A corporation (a moon owner) by id. */
  corporation: (id: number) => string;
  /**
   * A refinery through the label chain: an officer label, the structure name, the system, else
   * "Refinery <id>". Never the moon owner's name, so it is safe on a miner's line or mail.
   */
  refinery: (id: number) => string;
  /** The same chain, falling back to the moon owner's name plus the id: officer screens about a moon owner only. */
  ownerRefinery: (id: number) => string;
  moon: (id: number) => string;
  ore: (typeId: number) => string;
}

const EMPTY_NAMES = {
  characters: new Map<number, string>(),
  refineries: new Map<number, string>(),
  ores: new Map<number, string>(),
  moons: new Map<number, string>(),
};

type Fetched =
  | { status: 'loading' }
  | { status: 'denied'; message?: string; unverified?: boolean }
  | { status: 'failed'; message: string }
  | { status: 'off'; verdict: OfficerVerdict }
  | {
      status: 'loaded';
      verdict: OfficerVerdict;
      data: BookData;
      pricesOn: BookViewInput['pricesOn'];
      moonOwnerPricesOn: NonNullable<BookViewInput['moonOwnerPricesOn']>;
      /** Set when the book is one Miner's read-model slice (#5258), not the whole book. */
      scope?: { minerId: string; totals?: HeaderTotals };
    };

export type CorpBookState =
  | { status: 'loading' }
  /**
   * No corporation, or the Character's roles cannot open the book. `unverified`: the server
   * could not check the token, which says nothing about the roles.
   */
  | { status: 'denied'; message?: string; unverified?: boolean }
  /** `message` is a dim details line (an error code), never a sentence to read. */
  | { status: 'failed'; message: string }
  /** The corporation has no active book yet. */
  | { status: 'off'; verdict: OfficerVerdict }
  | {
      status: 'ready';
      verdict: OfficerVerdict;
      settings: BookSettings;
      view: BookView;
      names: BookNames;
      data: BookData;
    };

export interface CorpBook {
  state: CorpBookState;
  /** Re-reads the book; call after an edit. */
  reload: () => void;
  characterId: number | null;
  corporationId: number | null;
}

function utcNow() {
  return new Date().toISOString();
}

/** A refused read ends the page's book: a lost role wipes the local rows (ADR 0031). */
async function failedFetch(
  error: unknown,
  characterId: number,
  corporationId: number
): Promise<Fetched> {
  const code = (error as { code?: string }).code ?? '';
  if (code.endsWith('unauthenticated') || code.endsWith('permission-denied'))
    await forgetObservedCopy(characterId, corporationId).catch(() => {});
  return code.endsWith('unauthenticated')
    ? { status: 'denied', unverified: true }
    : code.endsWith('permission-denied')
      ? { status: 'denied', message: (error as Error).message }
      : {
          status: 'failed',
          message: code || (error instanceof Error ? error.message : String(error)),
        };
}

/**
 * `wanted` is what the open page joins (`bookPartsFor`); default the whole book. Only those
 * slices are read, and a page that wants more reads just the slices it adds. Until they
 * are in, the state is `loading`.
 */
export function useCorpBook(
  sync: CorpTaxBookSync,
  wanted: BookPartSet = ALL_BOOK_PART_SET,
  options: { minerId?: string } = {}
): CorpBook {
  const scopedMiner = CORP_BOOK_MINER_SCOPED_READ ? options.minerId : undefined;
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const [fetched, setFetched] = useState<Fetched>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(utcNow);
  const [names, setNames] = useState(EMPTY_NAMES);
  const [memberIds, setMemberIds] = useState<ReadonlySet<number> | undefined>(undefined);
  const [surveyOreLines, setSurveyOreLines] = useState<BookViewInput['surveyOreLines']>(undefined);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const wantedKey = [...wanted].sort().join(',');
  // A stable copy: the full read below and the tab-switch read both start from the latest ask.
  const wantedRef = useRef(wanted);
  useEffect(() => {
    wantedRef.current = wanted;
  }, [wanted]);

  // A page left open turns stale and rolls a day over (the sync hook's known gap).
  useEffect(() => {
    const id = window.setInterval(() => setNow(utcNow()), MINUTE_MS);
    return () => window.clearInterval(id);
  }, []);

  // A finished sync changes the book: read it again.
  const finishedAt = sync.run.phase === 'done' ? sync.run.finishedAt : 0;

  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const verdict = await verifyOfficer(characterId, corporationId);
        if (cancelled) return;
        // An officer record that no longer lets this Character view takes the local rows with it (ADR 0031).
        if (!verdict.canView) await forgetObservedCopy(characterId, corporationId).catch(() => {});
        if (!verdict.bookActive) {
          setFetched({ status: 'off', verdict });
          return;
        }
        let data: BookData | null;
        let scope: { minerId: string; from: string; totals?: HeaderTotals } | undefined;
        if (scopedMiner !== undefined) {
          const miner = await readMinerBookData(characterId, corporationId, scopedMiner);
          data = miner?.data ?? null;
          if (miner) scope = { minerId: scopedMiner, from: miner.from, totals: miner.totals };
        } else {
          data = await readBookData(characterId, corporationId, wantedRef.current);
          // The page moved on while this read ran: take the slices it now wants.
          const late = data ? missingBookParts(wantedRef.current, data.parts) : undefined;
          if (data && late && late.size > 0) {
            const more = await readBookData(characterId, corporationId, late);
            if (more) data = mergeBookData(data, more);
          }
        }
        if (cancelled) return;
        if (!data?.settings.active) {
          setFetched({ status: 'off', verdict });
          return;
        }
        // Prices for every ore on every day it was mined, at the book's hub and Ore Form. A Miner's
        // slice prices only its open window: a day on a Statement is frozen and needs no price.
        const priced = scope ? data.observed.filter((r) => r.date >= scope.from) : data.observed;
        const typeIds = new Set<number>(priced.map((r) => r.typeId));
        for (const x of data.state.extractions)
          for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
        const dates = new Set<string>(priced.map((r) => r.date));
        const loadedOn = utcNow().slice(0, 10);
        dates.add(loadedOn);
        const prices = await loadDatedUnitPricesByHub(
          [...typeIds],
          [data.settings.hubId],
          [...dates],
          data.settings.oreForm === 'compressed',
          { moonOwner: true }
        );
        if (cancelled) return;
        setFetched({
          status: 'loaded',
          verdict,
          data,
          ...(scope ? { scope: { minerId: scope.minerId, totals: scope.totals } } : {}),
          // A page left open past midnight asks for a day it never priced: use the last loaded one.
          pricesOn: (date) => {
            const day = priceDay(prices, data.settings.hubId, date);
            return day.prices.size > 0 ? day : priceDay(prices, data.settings.hubId, loadedOn);
          },
          // No fallback day: the moon owner's page prices an unsaved day at 0, so this does too.
          moonOwnerPricesOn: (date) =>
            moonOwnerPricesAtHubOnDate(prices, hubForPayee(data.settings.hubId).id, date),
        });
      } catch (error) {
        if (cancelled) return;
        setFetched(await failedFetch(error, characterId, corporationId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt, finishedAt, scopedMiner]);

  // A page that wants slices the book was opened without reads just those.
  useEffect(() => {
    if (fetched.status !== 'loaded' || characterId === null || corporationId === null) return;
    const missing = missingBookParts(wantedRef.current, fetched.data.parts);
    if (missing.size === 0) return;
    let cancelled = false;
    readBookData(characterId, corporationId, missing).then(
      (extra) => {
        if (cancelled || !extra) return;
        setFetched((prev) =>
          prev.status === 'loaded'
            ? // The prices were built for the settings this page opened with: keep both.
              {
                ...prev,
                data: { ...mergeBookData(prev.data, extra), settings: prev.data.settings },
              }
            : prev
        );
      },
      async (error) => {
        const next = await failedFetch(error, characterId, corporationId);
        if (!cancelled) setFetched(next);
      }
    );
    return () => {
      cancelled = true;
    };
    // `wantedKey` is the dependency: the ref carries the set itself.
  }, [fetched, wantedKey, characterId, corporationId]);

  // Current membership comes from the public affiliation endpoint, so an Accountant sees leavers too (#4194).
  useEffect(() => {
    if (fetched.status !== 'loaded' || corporationId === null) return;
    const { data } = fetched;
    const ids = [
      ...data.observed.map((r) => r.characterId),
      ...data.state.miners.flatMap((m) => m.characterIds),
    ];
    let cancelled = false;
    loadCurrentMemberIds(ids, corporationId).then(
      (members) => {
        if (!cancelled) setMemberIds(members);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [fetched, corporationId]);

  // A chunk with no notification takes its ore from a linked Moon Ore Survey (D13).
  useEffect(() => {
    if (fetched.status !== 'loaded') return;
    const { data } = fetched;
    const wanted = data.state.extractions.filter(
      (x) => x.surveyId !== undefined && (x.oreLines ?? []).length === 0
    );
    let cancelled = false;
    const measured = learnChunkRates(data.state.extractions.map(measurable));
    (async () => {
      const found = new Map<string, { typeId: number; quantity: number }[]>();
      if (wanted.length > 0) {
        const [moonIds, types] = await Promise.all([loadMoonOreTypeIds(), loadTypes()]);
        const typeIdByName = new Map<string, number>();
        for (const id of moonIds) {
          const name = types[String(id)]?.name;
          if (name) typeIdByName.set(name, id);
        }
        await Promise.all(
          wanted.map(async (x) => {
            const survey = await loadSurvey(x.surveyId!);
            if (!survey.ok) return;
            const [first] = countedScans(survey.scans, survey.ignored);
            if (!first) return;
            const ex = toEngineExtraction(x);
            const estimate = estimateChunk(ex, {
              survey: surveyFractions(first.rocks, (ore) => typeIdByName.get(ore)),
              chunkM3PerHour: data.settings.chunkM3PerHour ?? undefined,
              measured: measured.get(ex.structureId),
            });
            if (estimate.oreLines.length > 0) found.set(ex.id, estimate.oreLines);
          })
        );
      }
      await Promise.resolve();
      if (!cancelled) setSurveyOreLines(found.size > 0 ? found : undefined);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetched]);

  const view = useMemo(() => {
    if (fetched.status !== 'loaded' || corporationId === null) return null;
    const { data } = fetched;
    const s = data.settings;
    const built = buildBookView({
      corporationId,
      now,
      startDate: s.startDate,
      graceHours: s.graceHours,
      minimumStatement: s.minimumStatement,
      overdueDays: s.overdueDays,
      cadence: s.cadence,
      hubId: s.hubId,
      oreForm: s.oreForm,
      structureExpiryHours: s.structureExpiryHours,
      chunkM3PerHour: s.chunkM3PerHour ?? undefined,
      lastSyncedAt: s.lastSync ? new Date(s.lastSync.at).toISOString() : undefined,
      rates: s.rates,
      entries: groupObservedEntries(data.observed),
      miners: data.state.miners,
      statements: data.state.statements,
      payments: data.state.payments,
      dismissals: data.state.dismissals,
      declarations: data.declarations,
      adjustments: data.adjustments,
      ...(data.state.writeOffs ? { writeOffs: data.state.writeOffs } : {}),
      feeders: data.feeders,
      extractions: data.state.extractions,
      paidStatementIds: data.state.paidStatementIds,
      pricesOn: fetched.pricesOn,
      moonOwnerPricesOn: fetched.moonOwnerPricesOn,
      memberIds,
      surveyOreLines,
    });
    return fetched.scope
      ? withMinerTotals(built, fetched.scope.minerId, fetched.scope.totals)
      : built;
  }, [fetched, now, corporationId, memberIds, surveyOreLines]);

  // Names, resolved after the figures so the tables never wait on them.
  useEffect(() => {
    if (!view || characterId === null) return;
    let cancelled = false;
    const characterIds = new Set<number>();
    for (const m of view.miners) for (const id of m.characterIds) characterIds.add(id);
    for (const p of view.input.payments) characterIds.add(p.characterId);
    if (fetched.status === 'loaded') {
      for (const a of fetched.data.groupingAnswers ?? []) characterIds.add(a.characterId);
      // Moon owners are corporations; the universe names lookup resolves both kinds.
      // A payee the moon owner named is a player or another corporation.
      for (const f of fetched.data.feeders ?? []) {
        characterIds.add(f.corporationId);
        if (f.payee) characterIds.add(f.payee.id);
      }
      // Systems too, for a refinery whose structure name is not readable (a moon owner's).
      const facts = refineryFacts(
        fetched.data.observed,
        learnedSystemsOf(fetched.data.feeders ?? [])
      );
      for (const s of facts.systemOf.values()) characterIds.add(s);
    }
    const refineryIds = new Set<number>([
      ...view.input.extractions.map((x) => x.structureId),
      ...view.charges.map((c) => c.structureId),
    ]);
    const moonIds = [
      ...view.input.extractions.map((x) => x.moonId),
      ...view.charges.flatMap((c) => (c.moonId === undefined ? [] : [c.moonId])),
    ];
    const typeIds = new Set<number>();
    for (const c of view.charges) for (const l of c.oreLines) typeIds.add(l.typeId);
    for (const x of view.input.extractions) for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
    (async () => {
      const [characters, ores, moons] = await Promise.all([
        resolveNames([...characterIds]).catch(() => new Map<number, string>()),
        loadTypeNames([...typeIds]).catch(() => new Map<number, string>()),
        loadMoonNames(moonIds).catch(() => new Map<number, string>()),
      ]);
      const refineries = new Map<number, string>();
      await Promise.all(
        [...refineryIds].map(async (id) => {
          const name = await loadStructureName(characterId, id).catch(() => null);
          if (name) refineries.set(id, name);
        })
      );
      if (!cancelled) setNames({ characters, refineries, ores, moons });
    })();
    return () => {
      cancelled = true;
    };
  }, [view, characterId, fetched]);

  const refineries = useMemo(
    () =>
      fetched.status === 'loaded'
        ? {
            // A moon owner's rows rarely carry a system; miners' own ledgers teach it (#4650).
            ...refineryFacts(fetched.data.observed, learnedSystemsOf(fetched.data.feeders ?? [])),
            labels: officerLabelsOf(fetched.data.feeders ?? []),
            // Read by the server with the moon owner's own grant (#4654).
            structureNames: structureNamesOf(fetched.data.feeders ?? []),
          }
        : null,
    [fetched]
  );
  const bookNames: BookNames = useMemo(() => {
    const sources: RefineryLabelSources = {
      officerLabels: (id) => refineries?.labels.get(id),
      structureName: (id) => names.refineries.get(id) ?? refineries?.structureNames.get(id),
      systemName: (id) => {
        const system = refineries?.systemOf.get(id);
        return system === undefined ? undefined : names.characters.get(system);
      },
      fallback: refineryPlaceholder,
    };
    return {
      character: (id) => names.characters.get(id) ?? `#${id}`,
      corporation: (id) => names.characters.get(id) ?? `#${id}`,
      refinery: refineryLabeler(sources),
      ownerRefinery: refineryLabeler({
        ...sources,
        ownerName: (id) => {
          const owner = refineries?.sourceOf.get(id);
          return owner === undefined ? undefined : names.characters.get(owner);
        },
      }),
      moon: (id) => names.moons.get(id) ?? `Moon ${id}`,
      ore: (typeId) => names.ores.get(typeId) ?? `#${typeId}`,
    };
  }, [names, refineries]);

  const state: CorpBookState =
    fetched.status === 'loaded'
      ? // A book read for another page's scope is not this page's: wait for the right one.
        view &&
        fetched.scope?.minerId === scopedMiner &&
        missingBookParts(wanted, fetched.data.parts).size === 0
        ? {
            status: 'ready',
            verdict: fetched.verdict,
            settings: fetched.data.settings,
            view,
            names: bookNames,
            data: fetched.data,
          }
        : { status: 'loading' }
      : fetched;
  return { state, reload, characterId, corporationId };
}

function priceDay(
  data: Awaited<ReturnType<typeof loadDatedUnitPricesByHub>>,
  hubId: string,
  date: string
) {
  const id = hubForPayee(hubId).id;
  return {
    prices: new Map(pricesAtHubOnDate(data, id, date)),
    sources: new Map(sourcesAtHubOnDate(data, id, date)),
  };
}
