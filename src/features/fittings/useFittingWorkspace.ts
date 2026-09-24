/**
 * Orchestrates the Fittings page: the open Fitting lives in the `?f=` Share
 * Link (CONTEXT.md **Share Link**) — every load rewrites it, a reload or a
 * pasted URL decodes it back. Stats (dogma engine, lazy) and price (hub order
 * book) are two independent loads off the same `fitting`, which is why price
 * can resolve well before stats do.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useUrlParam } from '@/lib/useUrlState';
import { nullableTextParam } from '@/lib/urlState';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fitting/fittingShare';
import {
  loadEftFitting,
  eftResultToFitting,
  type EftUnresolvedItem,
} from '@/engine/fittings/eftLoader';
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
import { computeFittingStats, type DogmaAssetProgress } from './dogmaFittingEngine';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

async function hullName(typeId: number): Promise<string> {
  const types = await loadTypes();
  return types[String(typeId)]?.name ?? `Type ${typeId}`;
}

export type ShareDecodeError = 'invalid' | 'unsupported-version';

export interface FittingWorkspace {
  fitting: Fitting | null;
  /** Set when `?f=` carries a payload this build can't read at all. */
  shareError: ShareDecodeError | null;
  /** Parse errors, unknown names and slot overflow from the most recent EFT paste. */
  unresolved: EftUnresolvedItem[];
  /** Set when a successfully-loaded Fitting was too large to fit a Share Link. */
  tooLargeToShare: boolean;
  loadFromEftText: (text: string) => Promise<void>;
  /** "My clone" vs "Fitting's" — the basis the open Fitting's stats read implants/boosters from. */
  implantBasis: ImplantBasis;
  /** `false` with no active Character: there is no clone to label "My clone", so the basis is always "fitting". */
  canUseCloneBasis: boolean;
  setImplantBasis: (basis: ImplantBasis) => void;
  /** Edits the set the open Fitting carries — writes through to `?f=` like any other edit. `undefined` removes it. */
  setImplantSet: (implantSet: FittingImplantSet | undefined) => Promise<void>;
  stats: FittingStats | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  price: Appraisal | null;
}

/** What the decode effect resets after this workspace's own `?f=` write, keyed by which write it was. */
type PendingWrite = 'external' | 'load' | 'edit';

export function useFittingWorkspace(): FittingWorkspace {
  const [shareCode, setShareCode] = useUrlParam('f', nullableTextParam());
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [fitting, setFitting] = useState<Fitting | null>(null);
  const [shareError, setShareError] = useState<ShareDecodeError | null>(null);
  const [unresolved, setUnresolved] = useState<EftUnresolvedItem[]>([]);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);
  // User's explicit toggle pick, layered over `defaultImplantBasis`'s
  // per-Fitting default; `null` means "no override yet, use the default".
  const [basisOverride, setBasisOverride] = useState<ImplantBasis | null>(null);

  const [stats, setStats] = useState<FittingStats | null>(null);
  const [statsProgress, setStatsProgress] = useState<DogmaAssetProgress | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [price, setPrice] = useState<Appraisal | null>(null);

  // Set right before this workspace's own `setShareCode` write, so the decode
  // effect below can tell its own write apart from every other way `shareCode`
  // changes (a pasted link, Back/Forward). `'load'` (a fresh EFT paste) keeps
  // this render's own `unresolved`/`tooLargeToShare` but is still a different
  // Fitting, so `basisOverride` still resets; `'edit'` (a picker edit on the
  // *same* Fitting) keeps both.
  const pendingWriteRef = useRef<PendingWrite>('external');

  // Decode whenever the URL's `f` changes — a fresh load's own write below, a
  // pasted link, or Back/Forward. A stale decode from a param that changed
  // again before this one resolved is dropped rather than clobbering a newer
  // result.
  useEffect(() => {
    let cancelled = false;
    const pending = pendingWriteRef.current;
    pendingWriteRef.current = 'external';
    if (pending === 'external') {
      setUnresolved([]);
      setTooLargeToShare(false);
      setBasisOverride(null);
    } else if (pending === 'load') {
      setBasisOverride(null);
    }
    if (shareCode === null) {
      // Synchronous, not a subscription, so the rule's usual "derive during
      // render instead" advice doesn't apply; matches the house pattern in
      // features/industry/useOpportunities.ts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFitting(null);
      setShareError(null);
      return;
    }
    void (async () => {
      const decoded = await decodeFittingShare(shareCode);
      if (cancelled) return;
      if (!decoded.ok) {
        setShareError(decoded.reason);
        setFitting(null);
        return;
      }
      const name = await hullName(decoded.value.hullTypeId);
      if (cancelled) return;
      setShareError(null);
      setFitting(shareToFitting(decoded.value, name));
    })();
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  // Only actually marks a write "ours" when the code is really changing: an
  // identical re-write no-ops `useUrlParam`, so the decode effect never
  // re-runs to consume the flag, which would wrongly suppress the *next*
  // external change's reset.
  const commitShareWrite = useCallback(
    (payload: string, kind: Exclude<PendingWrite, 'external'>) => {
      if (payload !== shareCode) pendingWriteRef.current = kind;
      setShareCode(payload);
    },
    [shareCode, setShareCode]
  );

  const loadFromEftText = useCallback(
    async (text: string) => {
      const [typeByName, slotByTypeId] = await Promise.all([loadItemNameMap(), loadFittingSlots()]);
      const result = loadEftFitting(text, typeByName, slotByTypeId);
      setUnresolved(result.unresolved);
      if (result.hullTypeId === null) return;

      const name = await hullName(result.hullTypeId);
      const loaded = eftResultToFitting(result, name);
      const encoded = await encodeFittingShare(fittingToShareInput(loaded));
      setTooLargeToShare(!encoded.ok);
      if (encoded.ok) {
        // The decode effect above picks this up and sets `fitting` — one path
        // for "a Fitting is now open", whether it arrived by paste or by URL.
        commitShareWrite(encoded.payload, 'load');
      } else {
        // Still shown — a Fitting this large just can't round-trip through a
        // reload or a pasted link until it's edited down.
        setShareError(null);
        setFitting(loaded);
      }
    },
    [commitShareWrite]
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
    async (implantSet: FittingImplantSet | undefined) => {
      if (fitting === null) return;
      const updated: Fitting = { ...fitting, implantSet };
      const encoded = await encodeFittingShare(fittingToShareInput(updated));
      setTooLargeToShare(!encoded.ok);
      if (encoded.ok) {
        // Updates `fitting` straight away rather than waiting on the decode
        // effect's async round trip: two quick edits both reading the old
        // `fitting` off the URL round trip would race and one would be lost.
        setFitting(updated);
        commitShareWrite(encoded.payload, 'edit');
      } else {
        // Same "still shown" trick as `loadFromEftText`'s own too-large branch.
        setShareError(null);
        setFitting(updated);
      }
    },
    [fitting, commitShareWrite]
  );

  // The active Character's own profile, or All V with no Character at all
  // (the logged-out Share Link view; also the fallback for the ordinary
  // route rendering before hydration resolves). Kept separate from the stats
  // effect below so toggling `implantBasis` alone doesn't re-fetch skills.
  const [rawProfile, setRawProfile] = useState<PilotProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setRawProfile(null);
    void (async () => {
      const profile =
        activeCharacterId === null
          ? buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)])
          : await loadActivePilotProfile(activeCharacterId);
      if (!cancelled) setRawProfile(profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  // Stats: recomputes whenever the Fitting, the raw profile, or the resolved
  // implant basis changes — the last two independently, so flipping the
  // toggle never re-fetches skills/implants just to re-run the same swap.
  useEffect(() => {
    let cancelled = false;
    // Cleared unconditionally, not only when `fitting` becomes null — a
    // swap from one open Fitting straight to another (a new paste, a pasted
    // link, Back/Forward) must not keep showing the *previous* fitting's
    // numbers under the new one's header until the new computation resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new fitting, not a render-time derivation
    setStatsError(false);
    setStatsProgress(null);
    setStats(null);
    if (fitting === null || rawProfile === null) return;
    void (async () => {
      try {
        const profile = applyImplantBasis(rawProfile, fitting, implantBasis);
        const result = await computeFittingStats(fitting, profile, (progress) => {
          if (!cancelled) setStatsProgress(progress);
        });
        if (!cancelled) setStats(result);
      } catch {
        if (!cancelled) setStatsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fitting, rawProfile, implantBasis]);

  // Price: independent of the dogma engine, so it can — and should — resolve
  // well before stats do.
  useEffect(() => {
    let cancelled = false;
    // Same reasoning as the stats effect above: cleared on every `fitting`
    // change, not only a transition to null, so a swap never shows the
    // previous fitting's price under the new one's header.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new fitting, not a render-time derivation
    setPrice(null);
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
    tooLargeToShare,
    loadFromEftText,
    implantBasis,
    canUseCloneBasis,
    setImplantBasis: setBasisOverride,
    setImplantSet,
    stats,
    statsProgress,
    statsError,
    price,
  };
}
