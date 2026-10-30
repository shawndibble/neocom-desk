/**
 * The detail lines under an Improve row's swap: the other stats it changes,
 * what it gives up, and what it costs.
 */
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { IskAmount, StatChangeList } from '@/components/ui';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { ImproveOption, RejectedOption } from '@/engine/fittings/improve';
import { isResource } from '@/engine/fittings/improveFigures';
import type { FittingStats } from '@/engine/fittings/types';
import { roleSwapChanges } from '@/engine/fittings/skillGains';
import {
  changeVerdict,
  diffFittingStats,
  type StatChange as StatChangeValue,
} from '@/engine/fittings/variationDelta';

/** How many stat changes a row spells out before counting the rest. */
const CHANGES_SHOWN = 4;

/** The swap's other changes, what the row prints first; the CPU, powergrid and calibration it takes after. */
function otherChanges(
  option: ImproveOption | RejectedOption,
  own: FittingStats,
  omit: readonly string[]
) {
  return diffFittingStats(own, option.after)
    .changes.filter((change) => !omit.includes(change.key))
    .sort((a, b) => Number(isResource(a.key)) - Number(isResource(b.key)));
}

/** The stats `changeLine` prints as rows (not those behind "N other stats"), so Gives up need not repeat them. */
export function shownChangeKeys(
  option: ImproveOption | RejectedOption,
  own: FittingStats,
  all = false,
  omit: readonly string[] = []
): string[] {
  return otherChanges(option, own, omit)
    .slice(0, all ? undefined : CHANGES_SHOWN)
    .map((change) => change.key);
}

/** The swap's other changes; `onOpen` makes the "N other stats" tail a button that spells them out. */
export function changeLine(
  t: TFunction,
  option: ImproveOption | RejectedOption,
  own: FittingStats,
  all = false,
  onOpen?: () => void,
  omit: readonly string[] = [],
  /** The goal's own stat changes, listed first in the same columns. */
  leading: readonly StatChangeValue[] = []
): ReactNode {
  const changes = otherChanges(option, own, omit);
  // Role figures it raises (reach, remote repair, bursts…); one it cuts is under Gives up.
  const roleGains = roleSwapChanges(own, option.after).filter(
    (change) => !omit.includes(change.key) && changeVerdict(change) === 'better'
  );
  if (changes.length === 0 && leading.length === 0 && roleGains.length === 0)
    return t('fittings.variations.noChanges');
  // One stat per row, so a long list reads down instead of running on as a sentence.
  const shown = changes.slice(0, all ? undefined : CHANGES_SHOWN);
  const rest = changes.length - shown.length;
  const label = rest > 0 ? t('fittings.makeItFit.otherStats', { count: rest }) : null;
  return (
    <>
      <StatChangeList changes={[...leading, ...shown]} />
      {roleGains.map((change) => (
        <span key={change.key} className="block">
          {t(`fittings.whatToTrain.role.${change.key}`, {
            before: change.before,
            after: change.after,
          })}
        </span>
      ))}
      {label !== null &&
        (onOpen ? (
          <button type="button" className={textActionClassName()} onClick={onOpen}>
            {label}
          </button>
        ) : (
          <span className="block">{label}</span>
        ))}
    </>
  );
}

/** What the swap gives up that the rows above do not already show (`shown`): nothing left, nothing to say. */
export function unshownLosses(option: ImproveOption, shown: readonly string[]) {
  return option.lost.filter((lost) => lost.kind !== 'stat' || !shown.includes(lost.change.key));
}

/** Each stat the swap makes worse that the rows above do not show, with its before → after, so the loss has a size: one per row. */
export function lostLine(
  t: TFunction,
  option: ImproveOption,
  shown: readonly string[] = []
): ReactNode {
  const lost = unshownLosses(option, shown);
  const stats = lost.flatMap((loss) => (loss.kind === 'stat' ? [loss.change] : []));
  return (
    <>
      {stats.length > 0 && <StatChangeList changes={stats} />}
      {lost.map((lost) =>
        lost.kind === 'stat' ? null : (
          <span key={lost.change.key} className="block">
            {t(`fittings.whatToTrain.role.${lost.change.key}`, {
              before: lost.change.before,
              after: lost.change.after,
            })}
          </span>
        )
      )}
    </>
  );
}

/** What the swap costs or saves. */
export function iskLine(t: TFunction, option: ImproveOption): ReactNode {
  if (option.iskDelta === null)
    return <span className="text-text-dim">{t('fittings.improve.noPrice')}</span>;
  return option.iskDelta < 0 ? (
    <span className="text-success">
      {t('fittings.makeItFit.saves')} <IskAmount value={-option.iskDelta} />
    </span>
  ) : (
    <span>
      {t('fittings.makeItFit.costs')} <IskAmount value={option.iskDelta} />
    </span>
  );
}
