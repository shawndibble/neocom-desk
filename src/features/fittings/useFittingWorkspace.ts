/**
 * Orchestrates the Fittings page (issue #1532): the open Fitting lives in the
 * `?f=` Share Link (CONTEXT.md **Share Link**) — every load rewrites it, a
 * reload or a pasted URL decodes it back. Stats (dogma engine, lazy) and
 * price (hub order book) are two independent loads off the same `fitting`,
 * which is why price can resolve well before stats do.
 */
import { useCallback, useEffect, useState } from 'react';
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
import type { Fitting, FittingStats } from '@/engine/fittings/types';
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

  const [stats, setStats] = useState<FittingStats | null>(null);
  const [statsProgress, setStatsProgress] = useState<DogmaAssetProgress | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [price, setPrice] = useState<Appraisal | null>(null);

  // Decode whenever the URL's `f` changes — a fresh load's own write below, a
  // pasted link, or Back/Forward. A stale decode from a param that changed
  // again before this one resolved is dropped rather than clobbering a newer
  // result.
  useEffect(() => {
    let cancelled = false;
    if (shareCode === null) {
      // A synchronous reset when the URL drops `f=` entirely (Back past the
      // last load) — not a subscription, so the rule's usual "derive during
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
        setShareCode(encoded.payload);
      } else {
        // Still shown — a Fitting this large just can't round-trip through a
        // reload or a pasted link until it's edited down.
        setShareError(null);
        setFitting(loaded);
      }
    },
    [setShareCode]
  );

  // Stats: the active Character's own profile, or All V with no Character at
  // all (the logged-out Share Link view is #1544's; this covers the same
  // fallback for the ordinary route rendering before hydration resolves).
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new fitting, not a render-time derivation
    setStatsError(false);
    setStatsProgress(null);
    if (fitting === null) {
      setStats(null);
      return;
    }
    void (async () => {
      try {
        const profile =
          activeCharacterId === null
            ? buildAllVProfile([...(await loadSkills()).map((skill) => skill.typeID)])
            : await loadActivePilotProfile(activeCharacterId);
        if (cancelled) return;
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
  }, [fitting, activeCharacterId]);

  // Price: independent of the dogma engine, so it can — and should — resolve
  // well before stats do.
  useEffect(() => {
    let cancelled = false;
    if (fitting === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new fitting, not a render-time derivation
      setPrice(null);
      return;
    }
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
    stats,
    statsProgress,
    statsError,
    price,
  };
}
