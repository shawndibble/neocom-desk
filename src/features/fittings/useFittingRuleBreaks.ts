import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HardpointKindOf } from '@/engine/fittings/hardpoints';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { ruleBreakLines, ruleBreakModuleKeys } from './ruleBreakText';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';

const EMPTY = { lines: [] as string[], flagged: new Set<string>() as ReadonlySet<string> };

/**
 * The open fit's rule breaks as sentences, and the modules they point at.
 * `stats` must be the ones calculated for `fitting`.
 */
export function useFittingRuleBreaks(
  fitting: Fitting | null,
  stats: FittingStats | null | undefined,
  catalogue: FittingCatalogue | null,
  kindOf: HardpointKindOf
) {
  const { t } = useTranslation();
  const computed = useMemo(() => {
    const rules = stats?.ruleBreaks ?? [];
    if (!fitting || rules.length === 0) return EMPTY;
    const groupOf = (typeId: number) => catalogue?.types[String(typeId)]?.groupID;
    // The catalogue holds no group names: a rule group reads as the market group of a fitted member.
    const group = (groupId: number) => {
      const member = fitting.modules.find((m) => groupOf(m.typeId) === groupId);
      const marketGroupId = catalogue?.marketTypes.find(
        (entry) => entry.typeId === member?.typeId
      )?.marketGroupId;
      return marketGroupId === undefined
        ? undefined
        : catalogue?.groupsById.get(marketGroupId)?.name;
    };
    return {
      lines: ruleBreakLines(t, fitting, rules, {
        type: (typeId) => catalogueTypeName(catalogue, typeId),
        group,
      }),
      flagged: ruleBreakModuleKeys(fitting, rules, groupOf, kindOf),
    };
  }, [t, fitting, stats, catalogue, kindOf]);
  // Stats are null while an edit recalculates: keep the last answer for the same hull so the block and flags don't flicker.
  const [kept, setKept] = useState({ shipTypeId: -1, result: EMPTY });
  if (stats && fitting && (kept.result !== computed || kept.shipTypeId !== fitting.shipTypeId)) {
    setKept({ shipTypeId: fitting.shipTypeId, result: computed });
  }
  if (!stats && fitting && kept.shipTypeId === fitting.shipTypeId) return kept.result;
  return computed;
}
