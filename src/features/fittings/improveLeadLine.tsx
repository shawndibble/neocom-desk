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
import { capacitorChange, STAT_DIGITS, type StatChangeKey } from '@/engine/fittings/variationDelta';
import { round } from '@/engine/fittings/fittingStatFields';
import { m3sFormat, moveLine, oreLine, twoDecimals } from './improveLineText';

/** What a row leads with: the figure, and the detail-line stats it already shows. */
export interface Lead {
  node: ReactNode;
  keys: string[];
  /** When the figure is a plain stat change, so a row of several lines them up as a list. */
  change?: { key: StatChangeKey; before: number; after: number };
  /** The lead's stat changes, for a row to list first among its other stats (same columns, same tone). */
  rows?: { key: StatChangeKey; before: number; after: number }[];
  /** The lead's worded figures, which have no stat form (Repairs 40 → 60 HP/s): a line of their own. */
  worded?: ReactNode;
}

/** What the lead figure depends on besides the option itself. */
export interface LeadContext {
  goal: ImproveGoal;
  hold: ImproveHold;
  target?: TargetProfile;
}

/** The stat rows a goal's worded lead already covers, so the rows under it do not repeat them. */
const WORDED_LEAD_KEYS: Partial<Record<ImproveGoal, readonly StatChangeKey[]>> = {
  transfer: ['capTransfer'],
  tackle: ['tacklePoints', 'webStrength', 'pointRange', 'webRange'],
  ewar: ['ecmStrength', 'dampStrength', 'disruptorStrength', 'painterStrength'],
};

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
    rows: [{ key, before, after }],
  });
  const text = (
    key: string,
    line: string | null,
    keys: readonly StatChangeKey[] = []
  ): Lead | null => {
    if (line === null) return null;
    const node = <span key={key}>{line}</span>;
    return { node, keys: [...keys], worded: node };
  };
  const dps = (): Lead => {
    const [was, now] = [damageOf(own, target), damageOf(option.after, target)];
    // A damage figure is labelled for what it is: applied to the Target Profile, or the fit's listed sustained DPS.
    if (target && own.applied.weapons.length > 0) return stat('appliedDps', was, now);
    return stat('sustainedDps', was, now);
  };
  const tank = () => stat('ehp', own.ehp, option.after.ehp);
  const role = (metric: RoleMetric): Lead | null => {
    const change = roleChanges(own, option.after).find((c) => c.key === metric);
    if (!change) return null;
    const node = (
      <span key={metric}>
        {t(`fittings.whatToTrain.role.${metric}`, {
          before: change.before,
          after: change.after,
        })}
      </span>
    );
    return { node, keys: [metric], worded: node };
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
      const worded = leads.filter((lead) => !lead.change);
      return leads.length === 0
        ? null
        : {
            rows: leads.flatMap((lead) => (lead.change ? [lead.change] : [])),
            worded:
              worded.length === 0 ? undefined : (
                <>
                  {worded.map((lead) => (
                    <span key={lead.keys.join() || String(lead.node)} className="block">
                      {lead.node}
                    </span>
                  ))}
                </>
              ),
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
    case 'explore': {
      // One row per figure, like the stat rows under it, and only the figures the swap changes: none, no lead.
      const [was, now] = [own.explore, option.after.explore];
      const figures: { key: StatChangeKey; before: number; after: number }[] = [
        { key: 'hackingStrength', before: was.hacking.strength, after: now.hacking.strength },
        { key: 'virusCoherence', before: was.hacking.coherence, after: now.hacking.coherence },
        { key: 'hackingCycle', before: was.hacking.cycleSeconds, after: now.hacking.cycleSeconds },
        { key: 'scanStrength', before: was.scanning.strength, after: now.scanning.strength },
        { key: 'scanTimeCut', before: was.scanning.duration, after: now.scanning.duration },
        { key: 'deviationCut', before: was.scanning.deviation, after: now.scanning.deviation },
      ];
      // Compared as shown, so a sub-rounding change never reads "X → X".
      const changed = figures
        .map((figure) => ({
          ...figure,
          before: round(figure.before, STAT_DIGITS[figure.key]),
          after: round(figure.after, STAT_DIGITS[figure.key]),
        }))
        .filter((figure) => figure.before !== figure.after);
      return changed.length > 0
        ? {
            node: <StatChangeList changes={changed} />,
            // The rows below are the shared stat diff, which carries these figures too.
            keys: changed.map((figure) => figure.key),
            rows: changed,
          }
        : null;
    }
    default:
      return text(goal, moveLine(t, goal, hold, option, own), WORDED_LEAD_KEYS[goal]);
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
