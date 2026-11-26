import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppraisalNetFees } from '@/engine/market/appraisal';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import { typeIdsInHaulingCategory } from './haulingCategories';
import {
  clearHaulingScanCache,
  type HaulMode,
  type HaulingProgress,
  type HaulingScan,
} from './haulingData';
import type { HaulingEnd } from './haulingHubs';
import { scanHaulingLane } from './haulingScanRun';
import type { HaulingFeesAt } from './haulingView';
import { tradeHubStanding, useTradeHubStandings, zeroStandingsAt } from './useTradeHubStandings';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export type HaulingScanState =
  | { status: 'loading'; progress: HaulingProgress | null }
  | { status: 'ready'; scan: HaulingScan }
  | { status: 'error' };

export function useHaulingScan(
  from: HaulingEnd,
  to: HaulingEnd,
  categoryId: number,
  mode: HaulMode,
  enabled = true,
  maxUnitPrice: number | null = null
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
        const scan = await scanHaulingLane(
          {
            from,
            to,
            mode,
            scope: categoryId,
            maxUnitPrice,
            typeIds: (groups, marketTypes) =>
              typeIdsInHaulingCategory(categoryId, groups, marketTypes),
          },
          controller.signal,
          (progress) => {
            if (!controller.signal.aborted) setState({ status: 'loading', progress });
          }
        );
        if (!controller.signal.aborted) setState({ status: 'ready', scan });
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException)) {
          setState({ status: 'error' });
        }
      }
    })();
    return () => controller.abort();
  }, [from, to, categoryId, mode, enabled, maxUnitPrice, attempt]);

  const refresh = useCallback(() => {
    clearHaulingScanCache();
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh };
}

export interface HaulingFees {
  accountingLevel: number;
  brokerRelationsLevel: number;
  at: HaulingFeesAt;
}

export function useHaulingFees(characterId: number | null): HaulingFees {
  const standings = useTradeHubStandings(characterId);
  const loadLevels = useCallback(
    () =>
      loadCharacterModifiers(characterId ?? 0, Date.now()).then((modifiers) => ({
        accounting: modifiers?.skills[SKILL_IDS.accounting] ?? 0,
        brokerRelations: modifiers?.skills[SKILL_IDS.brokerRelations] ?? 0,
      })),
    [characterId]
  );
  const levels = useKeyedLoad(characterId === null ? null : String(characterId), loadLevels).data;

  const accountingLevel = characterId === null ? 0 : (levels?.accounting ?? 0);
  const brokerRelationsLevel = characterId === null ? 0 : (levels?.brokerRelations ?? 0);
  return useMemo(() => {
    const byHub = new Map<TradeHub['id'], AppraisalNetFees>();
    const at = (hub: TradeHub): AppraisalNetFees => {
      let fees = byHub.get(hub.id);
      if (!fees) {
        fees = {
          accountingLevel,
          brokerRelationsLevel,
          standing:
            characterId === null ? zeroStandingsAt(hub.id) : tradeHubStanding(standings, hub.id),
        };
        byHub.set(hub.id, fees);
      }
      return fees;
    };
    return { accountingLevel, brokerRelationsLevel, at };
  }, [accountingLevel, brokerRelationsLevel, characterId, standings]);
}
