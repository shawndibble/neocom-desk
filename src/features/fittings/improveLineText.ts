/**
 * The plain-text lines an Improve row says about its swap: the figure the goal
 * scores, before and after, and why a rejected swap was turned down.
 */
import type { TFunction } from 'i18next';
import { commandOf } from '@/engine/fittings/improveCommand';
import { ewarOf, tackleOf } from '@/engine/fittings/improveTackle';
import {
  effectiveHold,
  remoteRepairOf,
  type ImproveGoal,
  type ImproveHold,
  type RejectedOption,
  type ImproveOption,
} from '@/engine/fittings/improve';
import { alignOf } from '@/engine/fittings/improveFigures';
import type { FittingStats } from '@/engine/fittings/types';
import { formatIskCompact } from '@/lib/isk';
import { createNumberFormat } from '@/lib/numberLocale';
import type { ImproveSettings } from './improveSettings';

export const m3sFormat = createNumberFormat({ maximumFractionDigits: 1 });
export const m3Format = createNumberFormat({ maximumFractionDigits: 0 });
export const twoDecimals = createNumberFormat({ maximumFractionDigits: 2 });

/** The guardrail a rejected swap broke; a budget or cap says by how much. */
export function brokeText(
  t: TFunction,
  option: RejectedOption,
  { iskBudget }: Pick<ImproveSettings, 'iskBudget'>,
  fitTotal: number | null
): string {
  if (option.guardrail !== 'spend' || iskBudget === null || option.iskDelta === null)
    return t(`fittings.improve.broke.${option.guardrail}`);
  const over = (fitTotal ?? 0) + option.iskDelta - iskBudget;
  return t('fittings.improve.broke.spendBudget', {
    over: formatIskCompact(over),
    cap: formatIskCompact(iskBudget),
  });
}

/** Mine more: the ore the row is scored with, and the m³/s it gives. */
export function oreLine(
  t: TFunction,
  option: ImproveOption | RejectedOption,
  own: FittingStats
): string {
  return t('fittings.improve.oreLine', {
    before: m3sFormat(own.mining.perSecond),
    after: m3sFormat(option.after.mining.perSecond),
  });
}

/** One figure a line compares: its i18n key and the two values, already formatted. */
interface Figure {
  key: string;
  before: string;
  after: string;
}

/** The figures joined with " · ", only those that change; null when none does. */
function changedFigures(t: TFunction, figures: readonly Figure[]): string | null {
  const changed = figures.filter((figure) => figure.before !== figure.after);
  if (changed.length === 0) return null;
  return changed
    .map((figure) => t(figure.key, { before: figure.before, after: figure.after }))
    .join(' · ');
}

/** Carry more, the align goals, Repair more, Transfer more, Hold tighter, Stronger EWAR, Stronger fleet support: the figure the goal scores, before and after. */
export function moveLine(
  t: TFunction,
  goal: ImproveGoal,
  holdChoice: ImproveHold,
  option: ImproveOption | RejectedOption,
  own: FittingStats
): string | null {
  const align = () =>
    t('fittings.improve.alignLine', {
      before: twoDecimals(alignOf(own)),
      after: twoDecimals(alignOf(option.after)),
    });
  if (goal === 'haul') {
    const hold = effectiveHold(own.holds, holdChoice);
    return t('fittings.improve.holdLine', {
      hold: t(`fittings.improve.hold.${hold}`),
      before: m3Format(own.holds[hold]),
      after: m3Format(option.after.holds[hold]),
    });
  }
  if (goal === 'repair')
    return t('fittings.improve.repairLine', {
      before: m3sFormat(remoteRepairOf(own)),
      after: m3sFormat(remoteRepairOf(option.after)),
    });
  if (goal === 'transfer')
    return t('fittings.improve.transferLine', {
      before: m3sFormat(own.support.capTransfer),
      after: m3sFormat(option.after.support.capTransfer),
    });
  if (goal === 'tackle') {
    const [was, now] = [tackleOf(own), tackleOf(option.after)];
    const f = (key: string, b: number, a: number): Figure => ({
      key: `fittings.improve.figure.${key}`,
      before: m3sFormat(b),
      after: m3sFormat(a),
    });
    return changedFigures(t, [
      f('points', was.points, now.points),
      f('web', was.web, now.web),
      f('reach', was.range / 1000, now.range / 1000),
    ]);
  }
  if (goal === 'command') {
    const [was, now] = [commandOf(own), commandOf(option.after)];
    return changedFigures(
      t,
      (['strength', 'burstRange', 'compression', 'fuel'] as const)
        .filter((key) => was[key] > 0)
        .map((key) => {
          const km = key === 'burstRange' || key === 'compression' ? 1000 : 1;
          return {
            key: `fittings.improve.command.${key}`,
            before: m3sFormat(was[key] / km),
            after: m3sFormat(now[key] / km),
          };
        })
    );
  }
  if (goal === 'ewar') {
    const [was, now] = [ewarOf(own), ewarOf(option.after)];
    const figures = changedFigures(t, [
      {
        key: 'fittings.improve.figure.moduleStrength',
        before: m3sFormat(was.strength),
        after: m3sFormat(now.strength),
      },
      {
        key: 'fittings.improve.figure.reach',
        before: m3sFormat(was.range / 1000),
        after: m3sFormat(now.range / 1000),
      },
    ]);
    return figures === null ? null : t('fittings.improve.ewarNote', { figures });
  }
  if (goal === 'explore') {
    const [was, now] = [own.explore, option.after.explore];
    const f = (key: string, b: number, a: number): Figure => ({
      key: `fittings.improve.figure.${key}`,
      before: m3sFormat(b),
      after: m3sFormat(a),
    });
    return changedFigures(t, [
      f('dataStrength', was.dataStrength, now.dataStrength),
      f('relicStrength', was.relicStrength, now.relicStrength),
      f('coherence', was.hacking.coherence, now.hacking.coherence),
      f('cycle', was.hacking.cycleSeconds, now.hacking.cycleSeconds),
      f('scanStrength', was.scanning.strength, now.scanning.strength),
      f('scanTimeCut', was.scanning.duration, now.scanning.duration),
      f('deviationCut', was.scanning.deviation, now.scanning.deviation),
    ]);
  }
  if (goal === 'align') return align();
  if (goal === 'warp')
    return t('fittings.improve.warpLine', {
      align: align(),
      before: twoDecimals(own.navigation.warpSpeed),
      after: twoDecimals(option.after.navigation.warpSpeed),
    });
  return null;
}
