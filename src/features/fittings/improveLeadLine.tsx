/**
 * What an Improve row leads with: the goal's own figure, before → after, and
 * the detail-line stats it already shows so the row does not say them twice.
 */
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { StatChange, StatChangeList } from '@/components/ui';
import {
  damageOf,
  type ImproveGoal,
  type ImproveHold,
  type ImproveOption,
  type ImproveResult,
} from '@/engine/fittings/improve';
import { alignOf, reachKm } from '@/engine/fittings/improveFigures';
import { bestOption } from '@/engine/fittings/improveKeys';
import {
  overallTerms,
  activeTank,
  roleChanges,
  type GainMetric,
  type RoleMetric,
} from '@/engine/fittings/skillGains';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { FittingStats } from '@/engine/fittings/types';
import { capacitorChange, type StatChangeKey } from '@/engine/fittings/variationDelta';
import { m3sFormat, moveLine, oreLine, twoDecimals } from './improveLineText';

/** What a row leads with: the figure, and the detail-line stats it already shows. */
export interface Lead {
  node: ReactNode;
  keys: string[];
  /** When the figure is a plain stat change, so a row of several lines them up as a list. */
  change?: { key: StatChangeKey; before: number; after: number };
}

/** What the lead figure depends on besides the option itself. */
export interface LeadContext {
  goal: ImproveGoal;
  hold: ImproveHold;
  target?: TargetProfile;
}

/** How many figures Best overall's lead line shows: the two that moved the score most. */
const OVERALL_LEAD_FIGURES = 2;

/**
 * The goal's own figure, before → after, first on every row. `keys` are the
 * detail-line stats it already shows, so the row does not say them twice.
 */
export function leadLine(
  t: TFunction,
  { goal, hold, target }: LeadContext,
  option: ImproveOption,
  own: FittingStats
): Lead | null {
  const stat = (key: StatChangeKey, before: number, after: number): Lead => ({
    node: <StatChange key={key} change={{ key, before, after }} />,
    keys: [key],
    change: { key, before, after },
  });
  const text = (key: string, line: string | null): Lead | null =>
    line === null ? null : { node: <span key={key}>{line}</span>, keys: [] };
  const dps = (): Lead => {
    const [was, now] = [damageOf(own, target), damageOf(option.after, target)];
    // A damage figure is labelled for what it is: applied to the Target Profile, or the fit's listed sustained DPS.
    if (target && own.applied.weapons.length > 0) return stat('appliedDps', was, now);
    return stat('sustainedDps', was, now);
  };
  const tank = () => stat('ehp', own.ehp, option.after.ehp);
  const role = (metric: RoleMetric): Lead | null => {
    const change = roleChanges(own, option.after).find((c) => c.key === metric);
    return change
      ? {
          node: (
            <span key={metric}>
              {t(`fittings.whatToTrain.role.${metric}`, {
                before: change.before,
                after: change.after,
              })}
            </span>
          ),
          keys: [],
        }
      : null;
  };
  // One figure that earned Best overall's score, worded as the row's other lines word it.
  const term = (metric: GainMetric): Lead | null => {
    switch (metric) {
      case 'dps':
        return dps();
      case 'ehp':
        return tank();
      case 'activeTank':
        return text(
          metric,
          t('fittings.improve.activeTankLine', {
            before: m3sFormat(activeTank(own)),
            after: m3sFormat(activeTank(option.after)),
          })
        );
      case 'speed':
        return stat('maxVelocity', own.navigation.maxVelocity, option.after.navigation.maxVelocity);
      case 'align':
        return text(
          metric,
          t('fittings.improve.alignLine', {
            before: twoDecimals(alignOf(own)),
            after: twoDecimals(alignOf(option.after)),
          })
        );
      case 'capacitor': {
        const change = capacitorChange(own, option.after);
        return change && stat('capacitor', change.before, change.after);
      }
      case 'lockRange':
        return stat(
          'maxTargetRange',
          own.targeting.maxTargetRange / 1000,
          option.after.targeting.maxTargetRange / 1000
        );
      default:
        return role(metric);
    }
  };
  switch (goal) {
    case 'damage':
      return dps();
    case 'tank':
      return tank();
    case 'overall': {
      // The figures that moved the score most, never one that stood still.
      const leads = overallTerms(own, option.after)
        .map(({ metric }) => term(metric))
        .filter((lead): lead is Lead => lead !== null)
        .slice(0, OVERALL_LEAD_FIGURES);
      return leads.length === 0
        ? null
        : {
            // A line each, like the change rows below them: the plain stat
            // changes as one list, any worded figure on its own line after.
            node: (
              <>
                <StatChangeList
                  changes={leads.flatMap((lead) => (lead.change ? [lead.change] : []))}
                />
                {leads
                  .filter((lead) => !lead.change)
                  .map((lead) => (
                    <span key={lead.keys.join() || String(lead.node)} className="block">
                      {lead.node}
                    </span>
                  ))}
              </>
            ),
            keys: leads.flatMap((lead) => lead.keys),
          };
    }
    case 'speed':
      return stat('maxVelocity', own.navigation.maxVelocity, option.after.navigation.maxVelocity);
    case 'reach':
      return text(
        goal,
        t('fittings.improve.reachLine', {
          before: m3sFormat(reachKm(own)),
          after: m3sFormat(reachKm(option.after)),
        })
      );
    case 'mining':
      return text(goal, oreLine(t, option, own));
    default:
      return text(goal, moveLine(t, goal, hold, option, own));
  }
}

/** The goal's figure now → after the single best swap; null when there is no result or the goal has no figure. */
export function bestFoundLine(
  t: TFunction,
  context: LeadContext,
  result: ImproveResult,
  own: FittingStats
): ReactNode {
  const best = bestOption(result);
  return best === null ? null : (leadLine(t, context, best, own)?.node ?? null);
}
