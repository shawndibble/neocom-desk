/**
 * Orchestrates the Fittings page (issue #1532): the open Fitting lives in the
 * `?f=` Share Link (CONTEXT.md **Share Link**) — every load rewrites it, a
 * reload or a pasted URL decodes it back. Stats (dogma engine, lazy) and
 * price (hub order book) are two independent loads off the same `fitting`,
 * which is why price can resolve well before stats do.
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
import type { Fitting, FittingImplantSet, FittingStats } from '@/engine/fittings/types';
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
  /** "My clone" vs "Fitting's" (issue #1535) — the basis the open Fitting's stats read implants/boosters from. */
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

export function useFittingWorkspace(): FittingWorkspace {
  const [shareCode, setShareCode] = useUrlParam('f', nullableTextParam());
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [fitting, setFitting] = useState<Fitting | null>(null);
  const [shareError, setShareError] = useState<ShareDecodeError | null>(null);
  const [unresolved, setUnresolved] = useState<EftUnresolvedItem[]>([]);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);
  // User's explicit toggle pick, layered over `defaultImplantBasis`'s
  // per-Fitting default; `null` means "no override yet, use the default".
  // Reset only when the URL's `f` changes for a reason other than this
  // workspace's own write (a pasted link, Back/Forward, a fresh EFT load) —
  // never on a picker edit, which must not snap the toggle back.
  const [basisOverride, setBasisOverride] = useState<ImplantBasis | null>(null);

  const [stats, setStats] = useState<FittingStats | null>(null);
  const [statsProgress, setStatsProgress] = useState<DogmaAssetProgress | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [price, setPrice] = useState<Appraisal | null>(null);

  // Set by `loadFromEftText` right before its own `setShareCode` write, so
  // the decode effect below can tell "the URL changed because we just wrote
  // it" (keep the unresolved list that write's own paste just reported) apart
  // from every other way `shareCode` changes — a pasted link, Back/Forward —
  // where a *previous* paste's stale unresolved list must not linger next to
  // the unrelated fitting that URL change just loaded.
  const ownWriteRef = useRef(false);
  // Set by `setImplantSet` right before its own write, same idea as
  // `ownWriteRef` but narrower: a picker edit must not reset `basisOverride`
  // (it's editing the *same* Fitting the toggle already applies to), but a
  // fresh EFT paste — which also sets `ownWriteRef` — is a genuinely
  // different Fitting and must still drop a stale override from whatever
  // was open before it.
  const implantEditRef = useRef(false);

  // Decode whenever the URL's `f` changes — a fresh load's own write below, a
  // pasted link, or Back/Forward. A stale decode from a param that changed
  // again before this one resolved is dropped rather than clobbering a newer
  // result.
  useEffect(() => {
    let cancelled = false;
    if (ownWriteRef.current) {
      ownWriteRef.current = false;
    } else {
      setUnresolved([]);
      setTooLargeToShare(false);
    }
    if (implantEditRef.current) {
      implantEditRef.current = false;
    } else {
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
        // Only actually flags "mine" when the code is really changing: an
        // identical re-paste writes the same URL, which `useUrlParam` no-ops
        // and the effect below then never re-runs to consume the flag,
        // wrongly suppressing the *next* external change's reset.
        if (encoded.payload !== shareCode) ownWriteRef.current = true;
        setShareCode(encoded.payload);
      } else {
        // Still shown — a Fitting this large just can't round-trip through a
        // reload or a pasted link until it's edited down.
        setShareError(null);
        setFitting(loaded);
      }
    },
    [shareCode, setShareCode]
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
        // Same "mine" bookkeeping as `loadFromEftText`, plus `implantEditRef`
        // so this write also spares `basisOverride` — this is the same
        // Fitting the toggle already applies to, just carrying a new set.
        if (encoded.payload !== shareCode) {
          ownWriteRef.current = true;
          implantEditRef.current = true;
        }
        setShareCode(encoded.payload);
      } else {
        // Same "still shown" trick as `loadFromEftText`'s own too-large branch.
        setShareError(null);
        setFitting(updated);
      }
    },
    [fitting, shareCode, setShareCode]
  );

  // Stats: the active Character's own profile, or All V with no Character at
  // all (the logged-out Share Link view is #1544's; this covers the same
  // fallback for the ordinary route rendering before hydration resolves).
  // The resolved implant basis then swaps in the Fitting's own carried set
  // where "fitting" applies (issue #1535).
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
    if (fitting === null) return;
    void (async () => {
      try {
        const rawProfile =
          activeCharacterId === null
            ? buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)])
            : await loadActivePilotProfile(activeCharacterId);
        if (cancelled) return;
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
  }, [fitting, activeCharacterId, implantBasis]);

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
