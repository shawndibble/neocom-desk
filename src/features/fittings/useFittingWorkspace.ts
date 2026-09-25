/**
 * Orchestrates the Fittings page (issue #1532): the open Fitting lives in the
 * `?f=` Share Link (CONTEXT.md **Share Link**) — every load rewrites it, a
 * reload or a pasted URL decodes it back. Its stats and price come from
 * `useFittingEvaluation`, under the active Character's pilot.
 *
 * Editing (issue #1533) goes through the same URL: `edit` applies a pure
 * `fittingEdit.ts` change, shows it at once, and pushes the re-encoded code
 * as a new history entry so Back/Forward walk the edits. Repeats of one
 * control inside `COALESCE_MS` (a drone stepper clicked five times) replace
 * rather than push, so Back skips the in-between counts.
 *
 * The implant/booster basis toggle ("My clone" vs "Fitting's") rides on the
 * same `edit()` path — an implant-set edit is just another Fitting change —
 * and is resolved here, per Fitting; the evaluation applies it. `profile`
 * itself (exposed to fit checks/candidates) always stays the active
 * Character's own.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/db';
import { renameFitting, saveFitting } from './myFittings';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useUrlParam } from '@/lib/useUrlState';
import { FITTING_EDIT_PATH, fittingEditLocation } from './fittingRoutes';
import { nullableTextParam } from '@/lib/urlState';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fitting/fittingShare';
import { loadEveFitXmlEntry, type FittingXmlDocument } from '@/engine/import/eveFitXml';
import { toLoadOutcome, type LoadedFitting, type LoadOutcome } from '@/engine/fittings/load';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import { launchDrones } from '@/engine/fittings/fittingEdit';
import { loadFittingFromText } from './loadFittingFromText';
import { defaultImplantBasis, type ImplantBasis } from '@/engine/fittings/implantBasis';
import type {
  Fitting,
  FittingImplantSet,
  PilotProfile,
  StatsErrorReason,
} from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypes, typeName } from '@/sde/loadSde';
import { usePilotProfile } from './fittingPilotProfile';
import { useFittingEvaluation, type FittingEvaluation } from './useFittingEvaluation';

export type ShareDecodeError = 'invalid' | 'unsupported-version';

/** One `<fitting>` entry from a Loaded EVE fittings-XML file, resolved but not yet opened. */
export interface FittingXmlListItem {
  name: string;
  hullName: string | null;
  /** What opening it would Load; a `failed` one (its hull didn't resolve) can't be opened. */
  load: LoadOutcome;
}

export type FittingXmlOpenAction = { kind: 'open'; loaded: LoadedFitting } | { kind: 'list' };

/** A single-fit export opens directly; anything else — a multi-fit file, or a single entry whose hull didn't resolve — needs the picker list instead. */
export function resolveFittingXmlOpenAction(items: FittingXmlListItem[]): FittingXmlOpenAction {
  const only = items.length === 1 ? items[0]!.load : null;
  return only?.kind === 'fitting' ? { kind: 'open', loaded: only } : { kind: 'list' };
}

/**
 * Resolves a Loaded fittings-XML document's `<fitting>` entries against the
 * type catalog — display data for the picker list, nothing opened yet. A
 * hull that doesn't resolve becomes a `failed` row rather than
 * dropping the entry, so a malformed fit in a multi-fit file surfaces its
 * own reason without taking the rest of the file down with it.
 */
export async function resolveFittingXmlDocument(
  document: FittingXmlDocument
): Promise<FittingXmlListItem[]> {
  const [typeByName, types] = await Promise.all([loadItemNameMap(), loadTypes()]);
  return document.entries.map((entry) => {
    const result = loadEveFitXmlEntry(entry, typeByName);
    const hullTypeId = result.hullTypeId;
    const resolvedHullName =
      hullTypeId === null ? null : (types[String(hullTypeId)]?.name ?? `Type ${hullTypeId}`);
    const name = entry.name.trim() !== '' ? entry.name : (resolvedHullName ?? entry.shipTypeName);
    return { name, hullName: resolvedHullName, load: toLoadOutcome(result, name, 'file') };
  });
}

const COALESCE_MS = 1000;

/** A pure change to the open Fitting — one of `src/engine/fittings/fittingEdit.ts`'s. */
export type FittingChange = (fitting: Fitting) => Fitting;

/** The open Fitting's evaluation (stats, price, Variations) plus everything that opens, edits and saves it. */
export interface FittingWorkspace extends FittingEvaluation {
  /** What `statsError` is about: the active Character's skills, or the ship data / calculation. */
  statsErrorReason: StatsErrorReason;
  fitting: Fitting | null;
  /** Set when `?f=` carries a payload this build can't read at all. */
  shareError: ShareDecodeError | null;
  /**
   * The most recent Load's outcome — its warnings, or why it failed —
   * replaced whole by every open, so no earlier Load's warnings outlive it.
   * Null after an open that wasn't a Load (a new hull, a saved Fitting, a
   * Share Link, Back/Forward).
   */
  lastLoad: LoadOutcome | null;
  /** Set when the open Fitting was too large to fit a Share Link. */
  tooLargeToShare: boolean;
  /** Loads EFT text, a DNA string / chat link, an eveship.fit link, or a killmail link. */
  loadFromInput: (text: string) => Promise<void>;
  /** Resolves a Loaded fittings-XML document's entries for the picker list — opens nothing itself. */
  loadFittingXmlDocument: (document: FittingXmlDocument) => Promise<FittingXmlListItem[]>;
  /** Opens a Loaded Fitting (a fittings-file entry, an In-game Fitting) as the active one. */
  openLoaded: (loaded: LoadedFitting) => Promise<void>;
  /** Opens a Fitting that wasn't Loaded (a new one from a hull). */
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
  /** The active Character's own skills and clone, for fit checks; null while loading. */
  profile: PilotProfile | null;
  /** The saved record the open Fitting came from, so Save updates it. */
  savedId: string | null;
  /** Saving needs a Character and a Fitting small enough to have a share code. */
  canSave: boolean;
  /**
   * The explicit "Save to My Fittings": the only thing here that writes
   * Dexie. Updates the record the Fitting was opened from, else adds one.
   */
  save: () => Promise<void>;
  /**
   * "Save as new…" (issue #1747): always adds a new My Fittings record from
   * what's on screen, leaving the record the Fitting was opened from
   * untouched. Becomes the Fitting's own saved record afterward, same as a
   * first-time Save.
   */
  saveAsNew: (name: string) => Promise<void>;
  /**
   * Renames the open Fitting on screen; a saved one has its My Fittings record
   * renamed too, so a later Save doesn't put the old name back. Otherwise
   * independent of Save.
   */
  rename: (name: string) => void;
  /** Opens a saved Fitting by its share code, under its saved name. */
  openSaved: (record: { id: string; name: string; code: string }) => void;
}

export function useFittingWorkspace(): FittingWorkspace {
  const [shareCode] = useUrlParam('f', nullableTextParam());
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useLayoutEffect(() => {
    locationRef.current = location;
  });
  // Every open or edit writes the Fitting's Share Link to the editor's own
  // path, so an open from the Start screen is a history entry Back returns
  // to. `push: false` overwrites the current entry (an edit run coalescing,
  // a Load's drone launch). Writing the URL already showing is a no-op.
  const setShareCode = useCallback(
    (code: string, { push = false }: { push?: boolean } = {}) => {
      const now = locationRef.current;
      if (now.pathname === FITTING_EDIT_PATH && new URLSearchParams(now.search).get('f') === code)
        return;
      // Only an entry already on the editor's path is ever overwritten: from
      // anywhere else (the library, a too-large Fitting's `/fittings`) it is a
      // new place, and replacing would erase the way Back.
      void navigate(fittingEditLocation(code), {
        replace: !push && now.pathname === FITTING_EDIT_PATH,
      });
    },
    [navigate]
  );
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [fitting, setFitting] = useState<Fitting | null>(null);
  const [shareError, setShareError] = useState<ShareDecodeError | null>(null);
  const [lastLoad, setLastLoad] = useState<LoadOutcome | null>(null);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // User's explicit toggle pick, layered over `defaultImplantBasis`'s
  // per-Fitting default; `null` means "no override yet, use the default".
  const [basisOverride, setBasisOverride] = useState<ImplantBasis | null>(null);

  // Set right before this hook's own `setShareCode` writes, so the decode
  // effect below can tell "the URL changed because we just wrote it" (keep
  // the `lastLoad` that write's own Load just reported) apart from every
  // other way `shareCode` changes — a pasted link, Back/Forward — which opens
  // a different Fitting that no Load reported on. An edit also records the
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
  // A Load whose source says nothing about which drones are out (EFT, DNA,
  // XML, In-game, a killmail) launches them once its first stats say how many
  // fit (scope decision `20260925-113331`). A link or
  // a saved Fitting carries its own counts, and any edit first cancels it.
  // Bound to the exact Fitting the Load opened — its share code until that
  // decodes, then the object — so the Fitting it replaces, still on screen
  // until the decode lands, can't take the launch instead. `writeUrl` is off
  // for a Load too large to link: it never wrote the URL, so its launch
  // mustn't overwrite the previous Fitting's entry either. Saving, switching
  // Character and any edit cancel it; `launchRequest` re-runs the launch
  // effect for a Load that changes nothing else (the Fitting already open).
  const launchPendingRef = useRef<
    { code: string } | { fitting: Fitting; writeUrl: boolean } | null
  >(null);
  const [launchRequest, setLaunchRequest] = useState(0);

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
      launchPendingRef.current = null;
      // Anything but an edit or a saved-Fitting open is a different Fitting.
      if (pending?.code !== shareCode) setSavedId(null);
      setLastLoad(null);
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
      // A name the user typed for this Load beats the one the link carries, which beats the hull name.
      const pendingName = pending?.code === shareCode ? pending.name : undefined;
      const fallbackName = pendingName ?? (await typeName(decoded.value.hullTypeId));
      if (cancelled) return;
      const opened = shareToFitting(
        pendingName === undefined ? decoded.value : { ...decoded.value, name: pendingName },
        fallbackName
      );
      // The Load's own write has decoded: from here the launch waits for this object's stats.
      const launch = launchPendingRef.current;
      if (launch !== null && 'code' in launch && launch.code === shareCode) {
        launchPendingRef.current = { fitting: opened, writeUrl: true };
      }
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
    async (loaded: Fitting, { launchDrones: launch = false }: { launchDrones?: boolean } = {}) => {
      const encoded = await encodeFittingShare(fittingToShareInput(loaded));
      setTooLargeToShare(!encoded.ok);
      const current = latestFittingRef.current;
      launchPendingRef.current = !launch
        ? null
        : !encoded.ok
          ? { fitting: loaded, writeUrl: false }
          : encoded.payload === shareCode && current !== null
            ? // The Fitting already open: its URL won't change, so nothing will decode.
              { fitting: current, writeUrl: true }
            : { code: encoded.payload };
      if (launch) setLaunchRequest((n) => n + 1);
      if (encoded.ok) {
        // The decode effect above picks this up and sets `fitting`. Only
        // actually flags "mine" when the code is really changing: an
        // identical re-load writes the same URL, which `useUrlParam` no-ops
        // and the effect below then never re-runs to consume the flag,
        // wrongly suppressing the *next* external change's reset.
        if (encoded.payload !== shareCode)
          ownWriteRef.current = { code: encoded.payload, fitting: null };
        setShareCode(encoded.payload, { push: true });
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
      const outcome = await loadFittingFromText(text);
      if (outcome.kind === 'share') {
        // Opens like any other Share Link: the decode effect does the rest.
        setLastLoad(null);
        setShareCode(outcome.code, { push: true });
        return;
      }
      setLastLoad(outcome);
      if (outcome.kind === 'failed') return;
      setSavedId(null);
      await commitFitting(outcome.fitting, { launchDrones: true });
    },
    [commitFitting, setShareCode]
  );

  const openLoaded = useCallback(
    async (loaded: LoadedFitting) => {
      setLastLoad(loaded);
      setSavedId(null);
      await commitFitting(loaded.fitting, { launchDrones: true });
    },
    [commitFitting]
  );

  const openFitting = useCallback(
    async (opened: Fitting) => {
      setLastLoad(null);
      setSavedId(null);
      await commitFitting(opened);
    },
    [commitFitting]
  );

  // `history`: 'push' for a person's edit (coalesced by `coalesceKey`);
  // 'replace' writes over the current entry, and 'none' leaves the URL alone —
  // both for a change the app makes on its own, like a Load's drone launch.
  const applyEdit = useCallback(
    (
      change: FittingChange,
      {
        coalesceKey,
        history = 'push',
      }: { coalesceKey?: string; history?: 'push' | 'replace' | 'none' } = {}
    ) => {
      const current = latestFittingRef.current;
      if (current === null) return;
      if (history === 'push') launchPendingRef.current = null;
      const next = change(current);
      latestFittingRef.current = next;
      setFitting(next);
      if (history === 'none') return;

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
        setShareCode(encoded.payload, { push: !coalesce && history === 'push' });
      })();
    },
    [setShareCode]
  );
  const edit = useCallback(
    (change: FittingChange, coalesceKey?: string) => applyEdit(change, { coalesceKey }),
    [applyEdit]
  );

  const canSave = activeCharacterId !== null && fitting !== null && !tooLargeToShare;

  const save = useCallback(async () => {
    const current = latestFittingRef.current;
    if (activeCharacterId === null || current === null) return;
    // What is saved is what is on screen: a launch still waiting on stats
    // would change the Fitting after the record was written.
    launchPendingRef.current = null;
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

  const saveAsNew = useCallback(
    async (name: string) => {
      const current = latestFittingRef.current;
      if (activeCharacterId === null || current === null) return;
      launchPendingRef.current = null;
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        const encoded = await encodeFittingShare(fittingToShareInput(current));
        if (!encoded.ok) return;
        const record = await saveFitting(activeCharacterId, { name, code: encoded.payload });
        setSavedId(record.id);
        // Now editing the new record, same as a first-time Save — its name
        // goes on screen too, not just in My Fittings.
        applyEdit((f) => ({ ...f, name }), { history: 'none' });
      } finally {
        savingRef.current = false;
      }
    },
    [activeCharacterId, applyEdit]
  );

  const rename = useCallback(
    (name: string) => {
      applyEdit((f) => ({ ...f, name }), { history: 'none' });
      if (savedId === null) return;
      void db.fittings.get(savedId).then((record) => {
        if (record) void renameFitting(record, name);
      });
    },
    [applyEdit, savedId]
  );

  // A saved record belongs to one Character; so does a launch's drone count.
  useEffect(() => {
    launchPendingRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setSavedId(null);
  }, [activeCharacterId]);

  const openSaved = useCallback(
    (record: { id: string; name: string; code: string }) => {
      pendingOpenRef.current = { code: record.code, name: record.name };
      setSavedId(record.id);
      setLastLoad(null);
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

  // The pilot the stats and fit checks run under; loaded once per Character,
  // not once per edit. A failed load is reported as a stats error.
  const {
    profile,
    failed: profileFailed,
    retry: retryProfile,
  } = usePilotProfile(activeCharacterId);
  const evaluation = useFittingEvaluation({ fitting, profile, implantBasis });

  const { stats: evaluatedStats, statsFitting } = evaluation;
  useEffect(() => {
    const pending = launchPendingRef.current;
    if (pending === null || fitting === null || evaluatedStats === null) return;
    // Until the decode lands, the code is written but the old Fitting is still on screen.
    if (!('fitting' in pending) || pending.fitting !== fitting || statsFitting !== fitting) return;
    launchPendingRef.current = null;
    const launched = launchDrones(fitting, {
      bandwidthTotal: evaluatedStats.droneBandwidthTotal,
      maxActive: evaluatedStats.maxActiveDrones,
      // A drone the engine gave no bandwidth for stays in the bay rather than launching unlimited.
      bandwidthOf: (typeId) =>
        evaluatedStats.droneBandwidthByType[typeId] ?? Number.POSITIVE_INFINITY,
    });
    if (launched !== fitting) {
      applyEdit(() => launched, { history: pending.writeUrl ? 'replace' : 'none' });
    }
  }, [evaluatedStats, statsFitting, fitting, applyEdit, launchRequest]);
  const retryEvaluation = evaluation.retry;
  // One retry for whichever failed: the skills load, or the engine and its calculation.
  const retry = useCallback(() => {
    if (profileFailed) retryProfile();
    else retryEvaluation();
  }, [profileFailed, retryProfile, retryEvaluation]);

  return {
    fitting,
    shareError,
    lastLoad,
    tooLargeToShare,
    loadFromInput,
    loadFittingXmlDocument: resolveFittingXmlDocument,
    openLoaded,
    openFitting,
    edit,
    implantBasis,
    canUseCloneBasis,
    setImplantBasis: setBasisOverride,
    setImplantSet,
    ...evaluation,
    statsError: evaluation.statsError || profileFailed,
    statsErrorReason: (profileFailed ? 'skills' : 'shipData') satisfies StatsErrorReason,
    retry,
    profile,
    savedId,
    canSave,
    save,
    saveAsNew,
    rename,
    openSaved,
  };
}
