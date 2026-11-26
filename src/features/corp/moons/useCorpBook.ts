import { soloCharacterId } from '../../../../functions/src/corpTaxBookDonationMatch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildBookView, type BookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { bookViewInputOf, loadBookPrices, surveyTypeIdsOf, type BookPrices } from './bookViewOf';
import {
  learnedSystemsOf,
  officerLabelsOf,
  refineryFacts,
  structureNamesOf,
  refineryLabeler,
  type RefineryLabelSources,
} from '@/engine/corpTaxBook/refinery';
import { estimateChunk, learnChunkRates, snapshotSources } from '@/engine/corpTaxBook/extraction';
import { measurable } from '@/engine/corpTaxBook/bookView';
import { toEngineExtraction } from '@/engine/corpTaxBook/sync';
import { loadCurrentMemberIds } from '../currentMembers';
import { loadMoonNames } from '@/features/character/moonNames';
import { loadSurvey } from '@/features/survey/surveyStore';
import { keptSurveyScan, loadMoonOreTypeIdByName } from './keptSurveyScan';
import { resolveNames } from '@/features/character/names';
import { loadStructureAccess, loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useActiveCorporationId } from '../owner';
import { withMoonDocs } from '@/engine/corpTaxBook/pullFigures';
import {
  verifyOfficer,
  type BookData,
  type BookPart,
  type BookSettings,
  type OfficerVerdict,
} from '../taxBook/bookClient';
import { bookPartsFor, extendBook, holdsParts, readBook, type BookRead } from '../taxBook/bookRead';
import { moonOwnersNeedRows } from '@/engine/corpTaxBook/moonOwners';
import { forgetObservedCopy } from '../taxBook/observedStore';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';
import { isRefineryPlaceholder, refineryPlaceholder, refineryUnreadable } from './moonsFormat';
import { MINUTE_MS } from '@/lib/age';

export interface BookNames {
  character: (id: number) => string;
  corporation: (id: number) => string;
  refinery: (id: number) => string;
  undockable?: (id: number) => boolean;
  ownerRefinery: (id: number) => string;
  moon: (id: number) => string;
  ore: (typeId: number) => string;
}

const EMPTY_NAMES = {
  characters: new Map<number, string>(),
  refineries: new Map<number, string>(),
  ores: new Map<number, string>(),
  moons: new Map<number, string>(),
  resolved: false,
  undockable: new Set<number>(),
};

type Fetched =
  | { status: 'loading' }
  | { status: 'denied'; message?: string; unverified?: boolean }
  | { status: 'failed'; message: string }
  | { status: 'off'; verdict: OfficerVerdict }
  | {
      status: 'loaded';
      verdict: OfficerVerdict;
      data: BookRead;
      pricesOn: BookViewInput['pricesOn'];
      moonOwnerPricesOn: NonNullable<BookViewInput['moonOwnerPricesOn']>;
    };

export type CorpBookState =
  | { status: 'loading' }
  | { status: 'denied'; message?: string; unverified?: boolean }
  | { status: 'failed'; message: string }
  | { status: 'off'; verdict: OfficerVerdict }
  | {
      status: 'ready';
      verdict: OfficerVerdict;
      settings: BookSettings;
      view: BookView;
      names: BookNames;
      data: BookData;
      refinery?: BookRead['refinery'];
    };

export interface CorpBook {
  state: CorpBookState;
  reload: () => void;
  requestRows: () => void;
  characterId: number | null;
  corporationId: number | null;
}

function utcNow() {
  return new Date().toISOString();
}

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

export function useCorpBook(
  sync: CorpTaxBookSync,
  wanted: ReadonlySet<BookPart> = bookPartsFor(),
  options: { minerId?: string; extractionId?: string; structureId?: number } = {}
): CorpBook {
  const scopedMiner = options.minerId;
  const scopedMoon = options.extractionId;
  const scopedRefinery = options.structureId;
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const [fetched, setFetched] = useState<Fetched>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(utcNow);
  const [names, setNames] = useState(EMPTY_NAMES);
  const [memberIds, setMemberIds] = useState<ReadonlySet<number> | undefined>(undefined);
  const [builtSurvey, setSurvey] = useState<
    | {
        from: Fetched;
        lines: NonNullable<BookViewInput['surveyOreLines']>;
        measured: ReadonlySet<string>;
        prices: BookPrices | undefined;
      }
    | undefined
  >(undefined);
  const survey = builtSurvey?.from === fetched ? builtSurvey : undefined;
  const surveyOreLines = survey?.lines;
  const surveyMeasured = survey?.measured;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const needsRows =
    fetched.status === 'loaded' && needsRowsFallback(wanted, fetched.data, now, corporationId);
  const [rowsAsked, setRowsAsked] = useState(false);
  const requestRows = useCallback(() => setRowsAsked(true), []);
  const required = useMemo(
    () => (needsRows ? new Set<BookPart>([...wanted, 'observed']) : wanted),
    [wanted, needsRows]
  );
  const asked = useMemo(
    () => (rowsAsked ? new Set<BookPart>([...required, 'observed']) : required),
    [required, rowsAsked]
  );
  const wantedKey = [...asked].sort().join(',');
  const wantedRef = useRef(asked);
  useEffect(() => {
    wantedRef.current = asked;
  }, [asked]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(utcNow()), MINUTE_MS);
    return () => window.clearInterval(id);
  }, []);

  const finishedAt = sync.run.phase === 'done' ? sync.run.finishedAt : 0;

  useEffect(() => {
    if (characterId === null || corporationId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const verdict = await verifyOfficer(characterId, corporationId);
        if (cancelled) return;
        if (!verdict.canView) await forgetObservedCopy(characterId, corporationId).catch(() => {});
        if (!verdict.bookActive) {
          setFetched({ status: 'off', verdict });
          return;
        }
        const read = await readBook(characterId, corporationId, {
          parts: wantedRef.current,
          ...(scopedMiner !== undefined ? { minerId: scopedMiner } : {}),
          ...(scopedMoon !== undefined ? { extractionId: scopedMoon } : {}),
          ...(scopedRefinery !== undefined ? { structureId: scopedRefinery } : {}),
        });
        const data =
          read && (await extendBook(characterId, corporationId, read, wantedRef.current));
        if (cancelled) return;
        if (!data?.settings.active) {
          setFetched({ status: 'off', verdict });
          return;
        }
        const { pricesOn, moonOwnerPricesOn } = await loadBookPrices(data, data.minerScope?.from);
        if (cancelled) return;
        setFetched({
          status: 'loaded',
          verdict,
          data,
          pricesOn,
          moonOwnerPricesOn,
        });
      } catch (error) {
        if (cancelled) return;
        setFetched(await failedFetch(error, characterId, corporationId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt, finishedAt, scopedMiner, scopedMoon, scopedRefinery]);

  useEffect(() => {
    if (fetched.status !== 'loaded' || characterId === null || corporationId === null) return;
    if (holdsParts(fetched.data, wantedRef.current)) return;
    let cancelled = false;
    const held = fetched.data;
    extendBook(characterId, corporationId, held, wantedRef.current)
      .then(async (merged) => {
        if (cancelled || merged === held) return;
        const prices =
          merged.parts.has('observed') && !held.parts.has('observed')
            ? await loadBookPrices(merged)
            : undefined;
        if (cancelled) return;
        setFetched((prev) =>
          prev.status === 'loaded' ? { ...prev, data: merged, ...prices } : prev
        );
      })
      .catch(async (error) => {
        const next = await failedFetch(error, characterId, corporationId);
        if (!cancelled) setFetched(next);
      });
    return () => {
      cancelled = true;
    };
  }, [fetched, wantedKey, characterId, corporationId]);

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

  useEffect(() => {
    if (fetched.status !== 'loaded') return;
    const { data } = fetched;
    const wanted = data.state.extractions.filter((x) => x.surveyId !== undefined);
    let cancelled = false;
    const measured = learnChunkRates(data.state.extractions.map(measurable));
    (async () => {
      const found = new Map<string, { typeId: number; quantity: number }[]>();
      const measuredIds = new Set<string>();
      if (wanted.length > 0) {
        const typeIdByName = wanted.every((x) => x.surveyScan)
          ? new Map<string, number>()
          : await loadMoonOreTypeIdByName();
        await Promise.all(
          wanted.map(async (x) => {
            const scan =
              x.surveyScan ?? keptSurveyScan(await loadSurvey(x.surveyId!), typeIdByName);
            if (!scan) return;
            const ex = toEngineExtraction(x);
            const estimate = estimateChunk(ex, {
              ...snapshotSources(scan),
              expiryHours: data.settings.structureExpiryHours[String(ex.structureId)],
              chunkM3PerHour: data.settings.chunkM3PerHour ?? undefined,
              measured: measured.get(ex.structureId),
            });
            if (estimate.oreLines.length > 0) found.set(ex.id, estimate.oreLines);
            if (estimate.measuredVolume) measuredIds.add(ex.id);
          })
        );
      }
      const prices =
        found.size > 0
          ? await loadBookPrices(data, data.minerScope?.from, surveyTypeIdsOf(found)).catch(
              () => undefined
            )
          : undefined;
      if (!cancelled)
        setSurvey(
          found.size > 0
            ? { from: fetched, lines: found, measured: measuredIds, prices }
            : undefined
        );
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetched]);

  const view = useMemo(() => {
    if (fetched.status !== 'loaded' || corporationId === null) return null;
    const built = buildBookView(
      bookViewInputOf(corporationId, now, fetched.data, survey?.prices ?? fetched, {
        memberIds,
        surveyOreLines,
        surveyMeasured,
      })
    );
    const { moon } = fetched.data;
    return moon ? withMoonDocs(built, moon.docs, moon.fromDocs) : built;
  }, [fetched, now, corporationId, memberIds, survey, surveyOreLines, surveyMeasured]);

  useEffect(() => {
    if (!view || characterId === null) return;
    let cancelled = false;
    const characterIds = new Set<number>();
    for (const m of view.miners) for (const id of m.characterIds) characterIds.add(id);
    for (const m of view.input.miners) characterIds.add(m.mainCharacterId);
    for (const p of view.input.payments) characterIds.add(p.characterId);
    for (const a of view.input.adjustments) characterIds.add(a.by);
    if (fetched.status === 'loaded') {
      for (const a of fetched.data.groupingAnswers ?? []) characterIds.add(a.characterId);
      for (const d of fetched.data.refinery?.docs.values() ?? [])
        for (const m of d.miners) {
          const solo = soloCharacterId(m.minerId);
          if (solo !== undefined) characterIds.add(solo);
        }
      if (
        corporationId !== null &&
        view.input.extractions.some((x) => x.sourceCorporationId !== undefined)
      )
        characterIds.add(corporationId);
      for (const f of fetched.data.feeders ?? []) {
        characterIds.add(f.corporationId);
        if (f.payee) characterIds.add(f.payee.id);
      }
      const facts = refineryFacts(
        fetched.data.observed,
        learnedSystemsOf(fetched.data.feeders ?? [])
      );
      for (const s of facts.systemOf.values()) characterIds.add(s);
    }
    const refineryIds = new Set<number>([
      ...view.input.extractions.map((x) => x.structureId),
      ...view.charges.map((c) => c.structureId),
      ...(fetched.status === 'loaded' ? (fetched.data.scheduledSync?.refineryIds ?? []) : []),
    ]);
    const moonIds = [
      ...view.input.extractions.map((x) => x.moonId),
      ...view.charges.flatMap((c) => (c.moonId === undefined ? [] : [c.moonId])),
    ];
    const typeIds = new Set<number>();
    for (const c of view.charges) for (const l of c.oreLines) typeIds.add(l.typeId);
    for (const x of view.input.extractions) for (const l of x.oreLines ?? []) typeIds.add(l.typeId);
    for (const id of surveyTypeIdsOf(view.input.surveyOreLines)) typeIds.add(id);
    (async () => {
      const [characters, ores, moons] = await Promise.all([
        resolveNames([...characterIds]).catch(() => new Map<number, string>()),
        loadTypeNames([...typeIds]).catch(() => new Map<number, string>()),
        loadMoonNames(moonIds).catch(() => new Map<number, string>()),
      ]);
      const refineries = new Map<number, string>();
      const serverNamed =
        fetched.status === 'loaded'
          ? structureNamesOf(fetched.data.feeders ?? [])
          : new Map<number, string>();
      const undockable = new Set<number>();
      await Promise.all(
        [...refineryIds].map(async (id) => {
          const access = await loadStructureAccess(characterId, id).catch(() => 'unknown');
          if (access === 'refused') undockable.add(id);
          if (serverNamed.has(id)) return;
          const name = await loadStructureName(characterId, id).catch(() => null);
          if (name) refineries.set(id, name);
        })
      );
      if (!cancelled) setNames({ characters, refineries, ores, moons, resolved: true, undockable });
    })();
    return () => {
      cancelled = true;
    };
  }, [view, characterId, fetched, corporationId]);

  const refineries = useMemo(
    () =>
      fetched.status === 'loaded'
        ? {
            ...refineryFacts(fetched.data.observed, learnedSystemsOf(fetched.data.feeders ?? [])),
            labels: officerLabelsOf(fetched.data.feeders ?? []),
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
      fallback: names.resolved ? refineryUnreadable : refineryPlaceholder,
    };
    const refinery = refineryLabeler(sources);
    return {
      character: (id) => names.characters.get(id) ?? `#${id}`,
      corporation: (id) => names.characters.get(id) ?? `#${id}`,
      refinery,
      undockable: (id) => names.undockable.has(id) && !isRefineryPlaceholder(refinery(id), id),
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
      ? view &&
        fetched.data.scopedMiner === scopedMiner &&
        fetched.data.forMoon === scopedMoon &&
        fetched.data.refinery?.structureId === scopedRefinery &&
        holdsParts(fetched.data, required)
        ? {
            status: 'ready',
            verdict: fetched.verdict,
            settings: fetched.data.settings,
            view,
            names: bookNames,
            data: fetched.data,
            ...(fetched.data.refinery ? { refinery: fetched.data.refinery } : {}),
          }
        : { status: 'loading' }
      : fetched;
  return { state, reload, requestRows, characterId, corporationId };
}

export function needsRowsFallback(
  wanted: ReadonlySet<BookPart>,
  data: BookData,
  now: string,
  corporationId: number | null
): boolean {
  if (wanted.has('observed') || !wanted.has('owners') || corporationId === null) return false;
  if (!data.parts.has('core') || !data.parts.has('owners')) return false;
  const feeders = data.feeders ?? [];
  return moonOwnersNeedRows({
    now,
    graceHours: data.settings.graceHours,
    bookCorporationId: corporationId,
    rates: data.settings.rates,
    feeders,
    ...(data.feederSummaries ? { summaries: data.feederSummaries } : {}),
  });
}
