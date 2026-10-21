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
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildBookView, type BookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { groupObservedEntries } from '@/engine/corpTaxBook/observed';
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
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
} from '@/features/miningTax/pricing';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import {
  readBookData,
  verifyOfficer,
  type BookData,
  type BookSettings,
  type OfficerVerdict,
} from '../taxBook/bookClient';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';

export interface BookNames {
  character: (id: number) => string;
  /** A corporation (a moon owner) by id. */
  corporation: (id: number) => string;
  refinery: (id: number) => string;
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
  | { status: 'denied'; message?: string }
  | { status: 'failed'; message: string }
  | { status: 'off'; verdict: OfficerVerdict }
  | {
      status: 'loaded';
      verdict: OfficerVerdict;
      data: BookData;
      pricesOn: BookViewInput['pricesOn'];
    };

export type CorpBookState =
  | { status: 'loading' }
  /** No corporation, or the Character's roles cannot open the book. */
  | { status: 'denied'; message?: string }
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

export function useCorpBook(sync: CorpTaxBookSync): CorpBook {
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const [fetched, setFetched] = useState<Fetched>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(utcNow);
  const [names, setNames] = useState(EMPTY_NAMES);
  const [memberIds, setMemberIds] = useState<ReadonlySet<number> | undefined>(undefined);
  const [surveyOreLines, setSurveyOreLines] = useState<BookViewInput['surveyOreLines']>(undefined);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // A page left open turns stale and rolls a day over (the sync hook's known gap).
  useEffect(() => {
    const id = window.setInterval(() => setNow(utcNow()), 60_000);
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
        if (!verdict.bookActive) {
          setFetched({ status: 'off', verdict });
          return;
        }
        const data = await readBookData(characterId, corporationId);
        if (cancelled) return;
        if (!data?.settings.active) {
          setFetched({ status: 'off', verdict });
          return;
        }
        // Prices for every ore on every day it was mined, at the book's hub and Ore Form.
        const typeIds = new Set<number>(data.observed.map((r) => r.typeId));
        for (const x of data.state.extractions)
          for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
        const dates = new Set<string>(data.observed.map((r) => r.date));
        const loadedOn = utcNow().slice(0, 10);
        dates.add(loadedOn);
        const prices = await loadDatedUnitPricesByHub(
          [...typeIds],
          [data.settings.hubId],
          [...dates],
          data.settings.oreForm === 'compressed'
        );
        if (cancelled) return;
        setFetched({
          status: 'loaded',
          verdict,
          data,
          // A page left open past midnight asks for a day it never priced: use the last loaded one.
          pricesOn: (date) => {
            const day = priceDay(prices, data.settings.hubId, date);
            return day.prices.size > 0 ? day : priceDay(prices, data.settings.hubId, loadedOn);
          },
        });
      } catch (error) {
        if (cancelled) return;
        const code = (error as { code?: string }).code ?? '';
        setFetched(
          code.endsWith('permission-denied') || code.endsWith('unauthenticated')
            ? { status: 'denied', message: (error as Error).message }
            : { status: 'failed', message: error instanceof Error ? error.message : String(error) }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt, finishedAt]);

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
    return buildBookView({
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
      feeders: data.feeders,
      extractions: data.state.extractions,
      paidStatementIds: data.state.paidStatementIds,
      pricesOn: fetched.pricesOn,
      memberIds,
      surveyOreLines,
    });
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
      for (const f of fetched.data.feeders ?? []) characterIds.add(f.corporationId);
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

  const bookNames: BookNames = useMemo(
    () => ({
      character: (id) => names.characters.get(id) ?? `#${id}`,
      corporation: (id) => names.characters.get(id) ?? `#${id}`,
      refinery: (id) => names.refineries.get(id) ?? `Refinery ${id}`,
      moon: (id) => names.moons.get(id) ?? `Moon ${id}`,
      ore: (typeId) => names.ores.get(typeId) ?? `#${typeId}`,
    }),
    [names]
  );

  const state: CorpBookState =
    fetched.status === 'loaded'
      ? view
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
