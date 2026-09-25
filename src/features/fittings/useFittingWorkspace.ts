/**
 * Orchestrates the Fittings page (issue #1532): the open Fitting lives in the
 * `?f=` Share Link (CONTEXT.md **Share Link**) — every load rewrites it, a
 * reload or a pasted URL decodes it back. Stats (dogma engine, lazy) and
 * price (hub order book) are two independent loads off the same `fitting`,
 * which is why price can resolve well before stats do.
 *
 * Editing (issue #1533) goes through the same URL: `edit` applies a pure
 * `fittingEdit.ts` change, shows it at once, and pushes the re-encoded code
 * as a new history entry so Back/Forward walk the edits. Repeats of one
 * control inside `COALESCE_MS` (a drone stepper clicked five times) replace
 * rather than push, so Back skips the in-between counts.
 *
 * The implant/booster basis toggle ("My clone" vs "Fitting's") rides on the
 * same `edit()` path — an implant-set edit is just another Fitting change —
 * but only affects the profile `computeFittingStats` sees; `profile` itself
 * (exposed to fit checks/candidates) always stays the active Character's own.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/db';
import { saveFitting } from './myFittings';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useUrlParam } from '@/lib/useUrlState';
import { nullableTextParam } from '@/lib/urlState';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fitting/fittingShare';
import {
  loadEftFitting,
  eftResultToFitting,
  type EftLoadResult,
  type EftSlotLookup,
  type EftUnresolvedItem,
} from '@/engine/fittings/eftLoader';
import {
  loadEveFitXmlEntry,
  fitXmlEntryResultToFitting,
  type FitXmlUnresolvedItem,
  type FittingXmlDocument,
} from '@/engine/import/eveFitXml';
import {
  classifyLoadInput,
  killmailVictimToLoadResult,
  loadDnaFitting,
} from '@/engine/fittings/linkLoader';
import { getKillmail } from '@/esi/endpoints';
import { fetchKillmailHash } from '@/lib/zkillboard';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import {
  applyImplantBasis,
  defaultImplantBasis,
  type ImplantBasis,
} from '@/engine/fittings/implantBasis';
import type {
  Fitting,
  FittingImplantSet,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypes, loadFittingSlots, loadSkills } from '@/sde/loadSde';
import { loadActivePilotProfile } from './fittingPilotProfile';
import { loadFittingPrice } from './fittingPrice';
import {
  computeFittingStats,
  isDogmaEngineReady,
  type DogmaAssetProgress,
} from './dogmaFittingEngine';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

/** Why a Load produced no Fitting, beyond the per-line `unresolved` list. */
export type LoadError = 'unrecognised' | 'killmail-not-found' | 'killmail-failed';

/** Fetches a killmail's victim and reads its fit; the hash is looked up when the link had none. */
async function loadKillmailFitting(
  killmailId: number,
  hash: string | undefined,
  slotByTypeId: EftSlotLookup
): Promise<EftLoadResult | LoadError> {
  const resolvedHash = hash ?? (await fetchKillmailHash(killmailId));
  if (resolvedHash === null) return 'killmail-not-found';
  try {
    const { data } = await getKillmail(killmailId, resolvedHash);
    return data === null
      ? 'killmail-failed'
      : killmailVictimToLoadResult(data.victim, slotByTypeId);
  } catch {
    return 'killmail-failed';
  }
}

async function hullName(typeId: number): Promise<string> {
  const types = await loadTypes();
  return types[String(typeId)]?.name ?? `Type ${typeId}`;
}

export type ShareDecodeError = 'invalid' | 'unsupported-version';

/** One `<fitting>` entry from a Loaded EVE fittings-XML file, resolved but not yet opened. */
export interface FittingXmlListItem {
  name: string;
  hullTypeId: number | null;
  hullName: string | null;
  /** Set only when `fitting` is `null` — why this entry's hull didn't resolve. */
  hullError: string | null;
  unresolved: FitXmlUnresolvedItem[];
  fitting: Fitting | null;
}

export type FittingXmlOpenAction = { kind: 'open'; item: FittingXmlListItem } | { kind: 'list' };

/** A single-fit export opens directly; anything else — a multi-fit file, or a single entry whose hull didn't resolve — needs the picker list instead. */
export function resolveFittingXmlOpenAction(items: FittingXmlListItem[]): FittingXmlOpenAction {
  return items.length === 1 && items[0]!.fitting !== null
    ? { kind: 'open', item: items[0]! }
    : { kind: 'list' };
}

const COALESCE_MS = 1000;

/** A pure change to the open Fitting — one of `src/engine/fittings/fittingEdit.ts`'s. */
export type FittingChange = (fitting: Fitting) => Fitting;

export interface FittingWorkspace {
  fitting: Fitting | null;
  /** Set when `?f=` carries a payload this build can't read at all. */
  shareError: ShareDecodeError | null;
  /** Parse errors, unknown names and slot overflow from the most recent EFT paste. */
  unresolved: EftUnresolvedItem[];
  /** Unresolved items from the most recently opened Loaded EVE-XML Fitting. */
  fitXmlUnresolved: FitXmlUnresolvedItem[];
  /** Set when the open Fitting was too large to fit a Share Link. */
  tooLargeToShare: boolean;
  /** Why the last Load produced no Fitting; null after a Load that did. */
  loadError: LoadError | null;
  /** Loads EFT text, a DNA string / chat link, an eveship.fit link, or a killmail link. */
  loadFromInput: (text: string) => Promise<void>;
  /** Resolves a Loaded fittings-XML document's entries for the picker list — opens nothing itself. */
  loadFittingXmlDocument: (document: FittingXmlDocument) => Promise<FittingXmlListItem[]>;
  /** Opens one resolved entry from that list as the active Fitting; a no-op for an unresolved (`fitting: null`) row. */
  openFittingXmlEntry: (item: FittingXmlListItem) => Promise<void>;
  /** Opens an already-built Fitting (In-game Fittings, issue #1539) the same way a successful Load does. */
  openFitting: (fitting: Fitting) => Promise<void>;
  /**
   * Applies a change to the open Fitting and rewrites `?f=`. `coalesceKey`
   * names the control it came from; a repeat of the same key within a second
   * replaces the history entry instead of adding one.
   */
  edit: (change: FittingChange, coalesceKey?: string) => void;
  /** "My clone" vs "Fitting's" — the basis the open Fitting's stats read implants/boosters from. */
  implantBasis: ImplantBasis;
  /** `false` with no active Character: there is no clone to label "My clone", so the basis is always "fitting". */
  canUseCloneBasis: boolean;
  setImplantBasis: (basis: ImplantBasis) => void;
  /** Edits the set the open Fitting carries via `edit()`. `undefined` removes it. */
  setImplantSet: (implantSet: FittingImplantSet | undefined) => void;
  /**
   * The latest stats. After an edit to the same hull these are the previous
   * fit's until the new calculation lands, so the bars don't blank on every
   * click — `statsFitting` says which Fitting they belong to.
   */
  stats: FittingStats | null;
  statsFitting: Fitting | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  /** The ship data (dogma engine) is loaded, so slot and fit checks can run. */
  engineReady: boolean;
  /** Skills and implants the stats and fit checks use; null while loading. */
  profile: PilotProfile | null;
  price: Appraisal | null;
  /** The saved record the open Fitting came from, so Save updates it. */
  savedId: string | null;
  /** Saving needs a Character and a Fitting small enough to have a share code. */
  canSave: boolean;
  /**
   * The explicit "Save to My Fittings": the only thing here that writes
   * Dexie. Updates the record the Fitting was opened from, else adds one.
   */
  save: () => Promise<void>;
  /** Opens a saved Fitting by its share code, under its saved name. */
  openSaved: (record: { id: string; name: string; code: string }) => void;
}

export function useFittingWorkspace(): FittingWorkspace {
  const [shareCode, setShareCode] = useUrlParam('f', nullableTextParam());
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [fitting, setFitting] = useState<Fitting | null>(null);
  const [shareError, setShareError] = useState<ShareDecodeError | null>(null);
  const [unresolved, setUnresolved] = useState<EftUnresolvedItem[]>([]);
  const [fitXmlUnresolved, setFitXmlUnresolved] = useState<FitXmlUnresolvedItem[]>([]);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [stats, setStats] = useState<{ fitting: Fitting; stats: FittingStats } | null>(null);
  const [statsProgress, setStatsProgress] = useState<DogmaAssetProgress | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [engineReady, setEngineReady] = useState(isDogmaEngineReady);
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  // User's explicit toggle pick, layered over `defaultImplantBasis`'s
  // per-Fitting default; `null` means "no override yet, use the default".
  const [basisOverride, setBasisOverride] = useState<ImplantBasis | null>(null);

  const [price, setPrice] = useState<Appraisal | null>(null);

  // Set right before this hook's own `setShareCode` writes, so the decode
  // effect below can tell "the URL changed because we just wrote it" (keep
  // the unresolved list that write's own paste just reported) apart from
  // every other way `shareCode` changes — a pasted link, Back/Forward — where
  // a *previous* paste's stale unresolved list must not linger next to the
  // unrelated fitting that URL change just loaded. An edit also records the
  // Fitting it wrote, so the effect shows that object as-is instead of
  // decoding its own write back into an identical copy (which would
  // recalculate stats twice per click).
  const ownWriteRef = useRef<{ code: string; fitting: Fitting | null } | null>(null);
  // A saved Fitting being opened: the decode effect names the Fitting after
  // it (the share code carries no name) and keeps `savedId` for it.
  const savingRef = useRef(false);
  const pendingOpenRef = useRef<{ code: string; name: string } | null>(null);

  // The Fitting the next edit applies to: the latest edit's result even before
  // its async encode has landed, so two fast clicks don't both start from the
  // same rendered Fitting and lose one.
  const latestFittingRef = useRef<Fitting | null>(null);
  const editSeqRef = useRef(0);
  // The coalesce key and time of the last edit that wrote the URL.
  const lastWriteRef = useRef<{ key: string; at: number } | null>(null);

  // Decode whenever the URL's `f` changes — a fresh load's own write below, a
  // pasted link, or Back/Forward. A stale decode from a param that changed
  // again before this one resolved is dropped rather than clobbering a newer
  // result.
  useEffect(() => {
    let cancelled = false;
    const own = ownWriteRef.current;
    ownWriteRef.current = null;
    const pending = pendingOpenRef.current;
    pendingOpenRef.current = null;
    if (own?.code !== shareCode) {
      // Anything but an edit or a saved-Fitting open is a different Fitting.
      if (pending?.code !== shareCode) setSavedId(null);
      setUnresolved([]);
      setFitXmlUnresolved([]);
      setTooLargeToShare(false);
      // Back/Forward or a pasted link ends any coalescing run: the next edit
      // pushes rather than overwriting the entry just navigated to.
      lastWriteRef.current = null;
    }
    // `own.fitting` is only set by `edit()` (a paste's own write carries
    // `fitting: null`) — an edit keeps the toggle's override, everything else
    // (a paste, Back/Forward) is a genuinely different Fitting.
    if (!(own?.code === shareCode && own.fitting)) {
      setBasisOverride(null);
    }
    if (shareCode === null) {
      latestFittingRef.current = null;
      // Synchronous, not a subscription, so the rule's usual "derive during
      // render instead" advice doesn't apply; matches the house pattern in
      // features/industry/useOpportunities.ts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFitting(null);
      setShareError(null);
      return;
    }
    if (own?.code === shareCode && own.fitting) {
      latestFittingRef.current = own.fitting;
      setShareError(null);
      setFitting(own.fitting);
      return;
    }
    void (async () => {
      const decoded = await decodeFittingShare(shareCode);
      if (cancelled) return;
      if (!decoded.ok) {
        setShareError(decoded.reason);
        latestFittingRef.current = null;
        setFitting(null);
        return;
      }
      const name =
        pending?.code === shareCode ? pending.name : await hullName(decoded.value.hullTypeId);
      if (cancelled) return;
      const opened = shareToFitting(decoded.value, name);
      latestFittingRef.current = opened;
      setShareError(null);
      setFitting(opened);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  // Shared tail for "a Fitting is now open, whether it arrived by Load, by
  // In-game Fittings, or by URL": re-encodes it as a Share Link and writes
  // `?f=`, or — too large to link — keeps it open locally, same as a
  // too-large Load.
  const commitFitting = useCallback(
    async (loaded: Fitting) => {
      const encoded = await encodeFittingShare(fittingToShareInput(loaded));
      setTooLargeToShare(!encoded.ok);
      if (encoded.ok) {
        // The decode effect above picks this up and sets `fitting`. Only
        // actually flags "mine" when the code is really changing: an
        // identical re-load writes the same URL, which `useUrlParam` no-ops
        // and the effect below then never re-runs to consume the flag,
        // wrongly suppressing the *next* external change's reset.
        if (encoded.payload !== shareCode)
          ownWriteRef.current = { code: encoded.payload, fitting: null };
        setShareCode(encoded.payload);
      } else {
        latestFittingRef.current = loaded;
        setShareError(null);
        setFitting(loaded);
      }
    },
    [shareCode, setShareCode]
  );

  const loadFromInput = useCallback(
    async (text: string) => {
      setLoadError(null);
      setFitXmlUnresolved([]);
      const input = classifyLoadInput(text);
      if (input.kind === 'unknown') {
        setUnresolved([]);
        setLoadError('unrecognised');
        return;
      }
      const [typeByName, slotByTypeId] = await Promise.all([loadItemNameMap(), loadFittingSlots()]);
      let result: EftLoadResult;
      if (input.kind === 'eft') {
        result = loadEftFitting(input.text, typeByName, slotByTypeId);
      } else if (input.kind === 'dna') {
        result = loadDnaFitting(input.dna, slotByTypeId);
      } else {
        const loaded = await loadKillmailFitting(input.killmailId, input.hash, slotByTypeId);
        if (typeof loaded === 'string') {
          setUnresolved([]);
          setLoadError(loaded);
          return;
        }
        result = loaded;
      }
      setUnresolved(result.unresolved);
      if (result.hullTypeId === null) return;
      setSavedId(null);

      const name = await hullName(result.hullTypeId);
      const loaded = eftResultToFitting(result, name);
      await commitFitting(loaded);
    },
    [commitFitting]
  );

  const openFitting = useCallback(
    async (loaded: Fitting) => {
      setUnresolved([]);
      setFitXmlUnresolved([]);
      setSavedId(null);
      await commitFitting(loaded);
    },
    [commitFitting]
  );

  /**
   * Resolves a Loaded fittings-XML document's `<fitting>` entries against the
   * type catalog — display data for the picker list, nothing opened yet. A
   * hull that doesn't resolve becomes a `fitting: null` row rather than
   * dropping the entry, so a malformed fit in a multi-fit file surfaces its
   * own reason without taking the rest of the file down with it.
   */
  const loadFittingXmlDocument = useCallback(
    async (document: FittingXmlDocument): Promise<FittingXmlListItem[]> => {
      const [typeByName, types] = await Promise.all([loadItemNameMap(), loadTypes()]);
      return document.entries.map((entry) => {
        const result = loadEveFitXmlEntry(entry, typeByName);
        const hullTypeId = result.hullTypeId;
        const resolvedHullName =
          hullTypeId === null ? null : (types[String(hullTypeId)]?.name ?? `Type ${hullTypeId}`);
        const name =
          entry.name.trim() !== '' ? entry.name : (resolvedHullName ?? entry.shipTypeName);
        return {
          name,
          hullTypeId,
          hullName: resolvedHullName,
          hullError: hullTypeId === null ? result.unresolved[0]!.reason : null,
          unresolved: result.unresolved,
          fitting: hullTypeId === null ? null : fitXmlEntryResultToFitting(result, name),
        };
      });
    },
    []
  );

  const openFittingXmlEntry = useCallback(
    async (item: FittingXmlListItem) => {
      if (item.fitting === null) return;
      setUnresolved([]);
      setFitXmlUnresolved(item.unresolved);
      setSavedId(null);
      await commitFitting(item.fitting);
    },
    [commitFitting]
  );

  const edit = useCallback(
    (change: FittingChange, coalesceKey?: string) => {
      const current = latestFittingRef.current;
      if (current === null) return;
      const next = change(current);
      latestFittingRef.current = next;
      setFitting(next);

      const seq = ++editSeqRef.current;
      void (async () => {
        const encoded = await encodeFittingShare(fittingToShareInput(next));
        // A later edit is already on its way; it writes the URL, not this one.
        if (seq !== editSeqRef.current) return;
        // Too large for a link: stays open locally, as a too-large paste does,
        // until an edit brings it back under the limit.
        setTooLargeToShare(!encoded.ok);
        if (!encoded.ok) return;
        // Push or replace is decided against the last edit that actually
        // wrote, not the last one asked for: a superseded first edit of a run
        // never wrote, so the one that does must still push, or the pre-edit
        // entry would be overwritten and Back would skip past it.
        const now = Date.now();
        const last = lastWriteRef.current;
        const coalesce =
          coalesceKey !== undefined &&
          last !== null &&
          last.key === coalesceKey &&
          now - last.at < COALESCE_MS;
        lastWriteRef.current = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
        ownWriteRef.current = { code: encoded.payload, fitting: next };
        setShareCode(encoded.payload, { push: !coalesce });
      })();
    },
    [setShareCode]
  );

  const canSave = activeCharacterId !== null && fitting !== null && !tooLargeToShare;

  const save = useCallback(async () => {
    const current = latestFittingRef.current;
    if (activeCharacterId === null || current === null) return;
    // Encoded now rather than read from the URL, which lags an edit until its
    // own async encode lands.
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const encoded = await encodeFittingShare(fittingToShareInput(current));
      if (!encoded.ok) return;
      // The record may have been deleted from the list since it was opened;
      // then this is a new save. A live one keeps its name, which the list
      // may have renamed since the Fitting was opened.
      const existing = savedId === null ? undefined : await db.fittings.get(savedId);
      const updating = existing?.characterId === activeCharacterId ? existing : undefined;
      const record = await saveFitting(activeCharacterId, {
        ...(updating ? { id: updating.id } : {}),
        name: updating?.name ?? current.name,
        code: encoded.payload,
      });
      setSavedId(record.id);
    } finally {
      savingRef.current = false;
    }
  }, [activeCharacterId, savedId]);

  // A saved record belongs to one Character.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setSavedId(null);
  }, [activeCharacterId]);

  const openSaved = useCallback(
    (record: { id: string; name: string; code: string }) => {
      pendingOpenRef.current = { code: record.code, name: record.name };
      setSavedId(record.id);
      setUnresolved([]);
      setTooLargeToShare(false);
      setShareCode(record.code, { push: true });
    },
    [setShareCode]
  );

  // No active Character means no clone to label "My clone" — the basis is
  // always "fitting" (the scope decision's "Share links open ... at All V").
  const canUseCloneBasis = activeCharacterId !== null;
  const implantBasis: ImplantBasis =
    fitting === null
      ? 'clone'
      : !canUseCloneBasis
        ? 'fitting'
        : (basisOverride ?? defaultImplantBasis(fitting));

  const setImplantSet = useCallback(
    (implantSet: FittingImplantSet | undefined) => {
      edit((f) => ({ ...f, implantSet }), 'implant-set');
    },
    [edit]
  );

  // The pilot the stats and fit checks run under: the active Character's own
  // profile, or All V with no Character at all (the logged-out Share Link
  // view is #1544's; this covers the same fallback for the ordinary route
  // rendering before hydration resolves). Loaded once per Character, not once
  // per edit.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setProfile(null);
    void (async () => {
      try {
        const loaded =
          activeCharacterId === null
            ? buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)])
            : await loadActivePilotProfile(activeCharacterId);
        if (!cancelled) setProfile(loaded);
      } catch {
        if (!cancelled) setStatsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  // A different hull (or none) is a different Fitting: drop the old numbers at
  // once rather than show them under the new one's header — a swap from one
  // open Fitting straight to another (a new paste, a pasted link,
  // Back/Forward). An edit to the same hull keeps them until the
  // recalculation below lands, so the bars don't blank on every click.
  const hullTypeId = fitting?.shipTypeId ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new hull, not a render-time derivation
    setStats(null);
    setStatsProgress(null);
    setPrice(null);
  }, [hullTypeId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new calculation, not a render-time derivation
    setStatsError(false);
    if (fitting === null || profile === null) return;
    void (async () => {
      try {
        // Swaps in the Fitting's own carried implants/boosters where the
        // resolved basis is "fitting" — `profile` (exposed as-is to fit
        // checks/candidates, which only care about skills) stays untouched.
        const effectiveProfile = applyImplantBasis(profile, fitting, implantBasis);
        const result = await computeFittingStats(fitting, effectiveProfile, (progress) => {
          if (!cancelled) setStatsProgress(progress);
        });
        if (cancelled) return;
        setEngineReady(true);
        setStats({ fitting, stats: result });
      } catch {
        if (!cancelled) setStatsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, profile, implantBasis]);

  // Price: independent of the dogma engine, so it can — and should — resolve
  // well before stats do.
  useEffect(() => {
    let cancelled = false;
    if (fitting === null) return;
    void (async () => {
      const result = await loadFittingPrice(fitting, DEFAULT_TRADE_HUB);
      if (!cancelled) setPrice(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting]);

  return {
    fitting,
    shareError,
    unresolved,
    fitXmlUnresolved,
    tooLargeToShare,
    loadError,
    loadFromInput,
    loadFittingXmlDocument,
    openFittingXmlEntry,
    openFitting,
    edit,
    implantBasis,
    canUseCloneBasis,
    setImplantBasis: setBasisOverride,
    setImplantSet,
    stats: stats?.stats ?? null,
    statsFitting: stats?.fitting ?? null,
    statsProgress,
    statsError,
    engineReady,
    profile,
    price,
    savedId,
    canSave,
    save,
    openSaved,
  };
}
