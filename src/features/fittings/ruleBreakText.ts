import type { TFunction } from 'i18next';
import type { HardpointKindOf } from '@/engine/fittings/hardpoints';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { Fitting, RuleBreak } from '@/engine/fittings/types';

export interface RuleBreakNames {
  type: (typeId: number) => string;
  group: (groupId: number) => string | undefined;
}

const RACK_ALIASES: Record<string, string> = { mid: 'medium' };

function rackOf(slot: string): string {
  return RACK_ALIASES[slot] ?? slot;
}

const RACKS = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);
const HARDPOINTS = new Set(['turret', 'launcher']);

function chargeOf(fitting: Fitting, typeId: number | null): number | undefined {
  if (typeId === null) return undefined;
  return fitting.modules.find((m) => m.typeId === typeId && m.chargeTypeId !== undefined)
    ?.chargeTypeId;
}

export function ruleBreakLine(
  t: TFunction,
  fitting: Fitting,
  rule: RuleBreak,
  names: RuleBreakNames
): string {
  switch (rule.kind) {
    case 'max_group': {
      const group = names.group(rule.groupId);
      return t(group ? 'fittings.ruleBreak.maxGroup' : 'fittings.ruleBreak.maxGroupUnknown', {
        name: group,
        allowed: rule.allowed,
        used: rule.used,
        limit: t(`fittings.ruleBreak.limit.${rule.limit}`),
      });
    }
    case 'max_type':
      return t('fittings.ruleBreak.maxType', {
        name: names.type(rule.typeId),
        allowed: rule.allowed,
        used: rule.used,
      });
    case 'slots':
      if (HARDPOINTS.has(rule.slot)) {
        return t('fittings.ruleBreak.hardpoints', {
          fitted: t(`fittings.ruleBreak.hardpoint.${rule.slot}.fitted`, { count: rule.used }),
          room: t(`fittings.ruleBreak.hardpoint.${rule.slot}.room`, { count: rule.available }),
        });
      }
      return t('fittings.ruleBreak.rack', {
        fitted: t('fittings.ruleBreak.rackFitted', { count: rule.used }),
        room: t('fittings.ruleBreak.rackRoom', {
          count: rule.available,
          rack: t(`fittings.ruleBreak.rackName.${rackOf(rule.slot)}`, { defaultValue: rule.slot }),
        }),
      });
    case 'charge_group':
    case 'charge_size': {
      const module = rule.typeId === null ? undefined : names.type(rule.typeId);
      const chargeId = chargeOf(fitting, rule.typeId);
      return t(
        chargeId === undefined || module === undefined
          ? 'fittings.ruleBreak.chargeUnknown'
          : 'fittings.ruleBreak.charge',
        { charge: chargeId === undefined ? '' : names.type(chargeId), name: module ?? '' }
      );
    }
    default:
      return t(`fittings.ruleBreak.item.${rule.kind}`, {
        name: rule.typeId === null ? t('fittings.ruleBreak.aModule') : names.type(rule.typeId),
      });
  }
}

export function ruleBreakLines(
  t: TFunction,
  fitting: Fitting,
  rules: readonly RuleBreak[],
  names: RuleBreakNames
): string[] {
  return [...new Set(rules.map((rule) => ruleBreakLine(t, fitting, rule, names)))];
}

export function ruleBreakModuleKeys(
  fitting: Fitting,
  rules: readonly RuleBreak[],
  groupOf: (typeId: number) => number | undefined,
  kindOf: HardpointKindOf
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const rule of rules) {
    for (const module of fitting.modules) {
      let hit: boolean;
      switch (rule.kind) {
        case 'max_group':
          hit = groupOf(module.typeId) === rule.groupId;
          break;
        case 'max_type':
          hit = module.typeId === rule.typeId;
          break;
        case 'slots':
          if (HARDPOINTS.has(rule.slot)) {
            hit = module.slot === 'high' && kindOf(module.typeId) === rule.slot;
          } else hit = RACKS.has(rackOf(rule.slot)) && module.slot === rackOf(rule.slot);
          break;
        default:
          hit = rule.typeId !== null && module.typeId === rule.typeId;
      }
      if (hit) keys.add(moduleKey(module));
    }
  }
  return keys;
}
