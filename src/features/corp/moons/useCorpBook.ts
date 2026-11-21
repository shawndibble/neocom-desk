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
 * `options.minerId` names the Miner whose page is open. The book is then that Miner's read-model
 * slice (#5258) instead of the whole ledger. `options.extractionId` names the pull whose moon page
 * is open: the book is then its window's rows plus the moon docs (#5716), or the whole book when a
 * doc is missing. `readBook` (taxBook/bookRead) decides which.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildBookView, type BookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { bookViewInputOf, loadBookPrices } from './bookViewOf';
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
  /** A corporation (a moon owner) by id. */
  corporation: (id: number) => string;
  /**
   * A refinery through the label chain: an officer label, the structure name, the system, else
   * "Refinery <id>". Never the moon owner's name, so it is safe on a miner's line or mail.
   */
  refinery: (id: number) => string;
  /** A refinery shown by a name the viewer's character cannot dock at to read for itself (the server read it). */
  undockable?: (id: number) => boolean;
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
  /** False until the name lookups have answered: a refinery is not "undockable" while still being asked about. */
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
      /** A refinery page's moon docs (#6348); absent on every other page. */
      refinery?: BookRead['refinery'];
    };

export interface CorpBook {
  state: CorpBookState;
  /** Re-reads the book; call after an edit. */
  reload: () => void;
  /** Reads the ledger rows a tab opened without; see `BookContextValue.requestRows`. */
  requestRows: () => void;
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
 * parts are read, and a page that wants more reads just the parts it adds. Until they
 * are in, the state is `loading`.
 */
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
  const [surveyOreLines, setSurveyOreLines] = useState<BookViewInput['surveyOreLines']>(undefined);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // The Moon owners tab reads no ledger rows unless its summaries cannot stand in (#5717).
  const needsRows =
    fetched.status === 'loaded' && needsRowsFallback(wanted, fetched.data, now, corporationId);
  // A dialog that prices from rows asks for them (`requestRows`); the page stays ready meanwhile.
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
  // A stable copy: the full read below and the tab-switch read both start from the latest ask.
  const wantedRef = useRef(asked);
  useEffect(() => {
    wantedRef.current = asked;
  }, [asked]);

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
        const read = await readBook(characterId, corporationId, {
          parts: wantedRef.current,
          ...(scopedMiner !== undefined ? { minerId: scopedMiner } : {}),
          ...(scopedMoon !== undefined ? { extractionId: scopedMoon } : {}),
          ...(scopedRefinery !== undefined ? { structureId: scopedRefinery } : {}),
        });
        // The page moved on while this read ran: take the parts it now wants.
        const data =
          read && (await extendBook(characterId, corporationId, read, wantedRef.current));
        if (cancelled) return;
        if (!data?.settings.active) {
          setFetched({ status: 'off', verdict });
          return;
        }
        // Prices for every ore on every day it was mined, at the book's hub and Ore Form. A Miner's
        // slice prices only its open window: a day on a Statement is frozen and needs no price.
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

  // A page that wants parts the book was opened without reads just those.
  useEffect(() => {
    if (fetched.status !== 'loaded' || characterId === null || corporationId === null) return;
    if (holdsParts(fetched.data, wantedRef.current)) return;
    let cancelled = false;
    const held = fetched.data;
    extendBook(characterId, corporationId, held, wantedRef.current)
      .then(async (merged) => {
        if (cancelled || merged === held) return;
        // Rows that arrive late (the Moon owners tab's fallback) need their own prices.
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
    const built = buildBookView(
      bookViewInputOf(corporationId, now, fetched.data, fetched, { memberIds, surveyOreLines })
    );
    const { moon } = fetched.data;
    return moon ? withMoonDocs(built, moon.docs, moon.fromDocs) : built;
  }, [fetched, now, corporationId, memberIds, surveyOreLines]);

  // Names, resolved after the figures so the tables never wait on them.
  useEffect(() => {
    if (!view || characterId === null) return;
    let cancelled = false;
    const characterIds = new Set<number>();
    for (const m of view.miners) for (const id of m.characterIds) characterIds.add(id);
    // A grouped Miner with no charge is in no view row; the book's record still names its main.
    for (const m of view.input.miners) characterIds.add(m.mainCharacterId);
    for (const p of view.input.payments) characterIds.add(p.characterId);
    // Whoever recorded a correction is named beside it, not shown as an ID.
    for (const a of view.input.adjustments) characterIds.add(a.by);
    if (fetched.status === 'loaded') {
      for (const a of fetched.data.groupingAnswers ?? []) characterIds.add(a.characterId);
      // A refinery page reads no ledger row, so a Miner in no grouping is known only by the id in a moon doc.
      for (const d of fetched.data.refinery?.docs.values() ?? [])
        for (const m of d.miners) {
          const solo = /^solo:(\d+)$/.exec(m.minerId);
          if (solo) characterIds.add(Number(solo[1]));
        }
      // Moon owners are corporations; the universe names lookup resolves both kinds.
      // A payee the moon owner named is a player or another corporation.
      // The book's own corporation is named beside a moon owner's on Extractions (#6097).
      if (
        corporationId !== null &&
        view.input.extractions.some((x) => x.sourceCorporationId !== undefined)
      )
        characterIds.add(corporationId);
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
      // The Sharing tab lists the book's refineries with no Extraction yet too (#6240).
      ...(fetched.status === 'loaded' ? (fetched.data.scheduledSync?.refineryIds ?? []) : []),
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
      // A name the server read with the moon owner's own grant is used as it is,
      // so no roster sweep is made for it. This character's own access is still
      // checked (one lookup per refinery, then cached, and a refusal is
      // remembered for a day), because a refinery you cannot dock at is worth
      // saying so. Only a confirmed refusal counts: offline or a failed request
      // says nothing about docking rights.
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
      fallback: names.resolved ? refineryUnreadable : refineryPlaceholder,
    };
    const refinery = refineryLabeler(sources);
    return {
      character: (id) => names.characters.get(id) ?? `#${id}`,
      corporation: (id) => names.characters.get(id) ?? `#${id}`,
      refinery,
      // Only worth a chip when a real name is showing: the stand-in already says it.
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
      ? // A book read for another page's scope is not this page's: wait for the right one.
        view &&
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

/**
 * Whether the Moon owners tab, read without ledger rows, must read them after all: a moon owner
 * its summary cannot stand in for (#5717).
 */
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
