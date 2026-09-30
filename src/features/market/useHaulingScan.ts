/**
 * Runs the Hauling Opportunities scan for a route and category, and reports
 * where it is: the panel shows a progress line while the two cheap passes and
 * the order-book pass run, then the rows. A route, category or mode change
 * abandons the scan in flight rather than letting a stale one land.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppraisalNetFees } from '@/engine/market/appraisal';
import { SKILL_IDS } from '@/engine/industry/types';
import { ZERO_STANDINGS } from '@/engine/market/standings';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadTypes } from '@/sde/loadSde';
import { typeIdsInCategory } from './haulingCategories';
import {
  clearHaulingScanCache,
  runHaulingScan,
  type HaulingEnd,
  type HaulMode,
  type HaulingProgress,
  type HaulingScan,
} from './haulingData';
import type { HaulingFeesAt } from './haulingView';
import { tradeHubStanding, useTradeHubStandings } from './useTradeHubStandings';

export type HaulingScanState =
  | { status: 'loading'; progress: HaulingProgress | null }
  | { status: 'ready'; scan: HaulingScan }
  | { status: 'error' };

export function useHaulingScan(
  from: HaulingEnd,
  to: HaulingEnd,
  categoryId: number,
  mode: HaulMode,
  enabled = true
): { state: HaulingScanState; refresh: () => void } {
  const [state, setState] = useState<HaulingScanState>({ status: 'loading', progress: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new route or refresh restarts the scan
    setState({ status: 'loading', progress: null });
    void (async () => {
      try {
        const [groups, marketTypes, types] = await Promise.all([
          loadMarketGroups(),
          loadMarketTypes(),
          loadTypes(),
        ]);
        const typeIds = typeIdsInCategory(categoryId, groups, marketTypes);
        const scan = await runHaulingScan({
          from,
          to,
          typeIds,
          scope: categoryId,
          mode,
          types,
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) setState({ status: 'loading', progress });
          },
        });
        if (!controller.signal.aborted) setState({ status: 'ready', scan });
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException)) {
          setState({ status: 'error' });
        }
      }
    })();
    return () => controller.abort();
  }, [from, to, categoryId, mode, enabled, attempt]);

  const refresh = useCallback(() => {
    clearHaulingScanCache();
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh };
}

export interface HaulingFees {
  accountingLevel: number;
  brokerRelationsLevel: number;
  /** The full fee rates for a sale at one hub — standings differ per hub owner. */
  at: HaulingFeesAt;
}

/**
 * The fee rates a sale is charged: this Character's Accounting and Broker
 * Relations levels, and — per hub — their standing toward that hub's owner.
 * Level 0 and zero standings until they load or with no Character, which is
 * the conservative side — the page says so.
 */
export function useHaulingFees(characterId: number | null): HaulingFees {
  const standings = useTradeHubStandings(characterId);
  const [levels, setLevels] = useState<{ accounting: number; brokerRelations: number } | null>(
    null
  );

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void loadCharacterModifiers(characterId, Date.now())
      .then((modifiers) => {
        if (cancelled || !modifiers) return;
        setLevels({
          accounting: modifiers.skills[SKILL_IDS.accounting] ?? 0,
          brokerRelations: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
        });
      })
      .catch(() => {
        // Stays at level 0: fees priced without skills read high, never low.
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const accountingLevel = characterId === null ? 0 : (levels?.accounting ?? 0);
  const brokerRelationsLevel = characterId === null ? 0 : (levels?.brokerRelations ?? 0);
  // Memoized per hub so each hub's fees keep one identity: rows and the trip plan recompute only when a level or standing changes.
  return useMemo(() => {
    const byHub = new Map<TradeHub['id'], AppraisalNetFees>();
    const at = (hub: TradeHub): AppraisalNetFees => {
      let fees = byHub.get(hub.id);
      if (!fees) {
        fees = {
          accountingLevel,
          brokerRelationsLevel,
          standing: characterId === null ? ZERO_STANDINGS : tradeHubStanding(standings, hub.id),
        };
        byHub.set(hub.id, fees);
      }
      return fees;
    };
    return { accountingLevel, brokerRelationsLevel, at };
  }, [accountingLevel, brokerRelationsLevel, characterId, standings]);
}
