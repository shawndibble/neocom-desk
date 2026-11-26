import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HardpointKindOf } from '@/engine/fittings/hardpoints';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { ruleBreakLines, ruleBreakModuleKeys } from './ruleBreakText';
import { useResolvedTypeNames } from './resolvedTypeNames';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';

const EMPTY = { lines: [] as string[], flagged: new Set<string>() as ReadonlySet<string> };

export function useFittingRuleBreaks(
  fitting: Fitting | null,
  stats: FittingStats | null | undefined,
  catalogue: FittingCatalogue | null,
  kindOf: HardpointKindOf
) {
  const { t } = useTranslation();
  const resolvedNames = useResolvedTypeNames();
  const computed = useMemo(() => {
    const rules = stats?.ruleBreaks ?? [];
    if (!fitting || rules.length === 0) return EMPTY;
    const groupOf = (typeId: number) => catalogue?.types[String(typeId)]?.groupID;
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
        type: (typeId) => catalogueTypeName(catalogue, typeId, resolvedNames),
        group,
      }),
      flagged: ruleBreakModuleKeys(fitting, rules, groupOf, kindOf),
    };
  }, [t, fitting, stats, catalogue, kindOf, resolvedNames]);
  const [kept, setKept] = useState({ shipTypeId: -1, result: EMPTY });
  if (stats && fitting && (kept.result !== computed || kept.shipTypeId !== fitting.shipTypeId)) {
    setKept({ shipTypeId: fitting.shipTypeId, result: computed });
  }
  if (!stats && fitting && kept.shipTypeId === fitting.shipTypeId) return kept.result;
  return computed;
}
