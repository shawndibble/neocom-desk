import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { IskAmount, StatChangeList } from '@/components/ui';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { ImproveOption, RejectedOption } from '@/engine/fittings/improve';
import { isResource } from '@/engine/fittings/improve';
import type { FittingStats } from '@/engine/fittings/types';
import { roleSwapChanges } from '@/engine/fittings/skillGains';
import {
  changeVerdict,
  diffFittingStats,
  type StatChange as StatChangeValue,
} from '@/engine/fittings/variationDelta';

const CHANGES_SHOWN = 4;

function otherChanges(
  option: ImproveOption | RejectedOption,
  own: FittingStats,
  omit: readonly string[]
) {
  return diffFittingStats(own, option.after)
    .changes.filter((change) => !omit.includes(change.key))
    .sort((a, b) => Number(isResource(a.key)) - Number(isResource(b.key)));
}

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

export function changeLine(
  t: TFunction,
  option: ImproveOption | RejectedOption,
  own: FittingStats,
  all = false,
  onOpen?: () => void,
  omit: readonly string[] = [],
  leading: readonly StatChangeValue[] = []
): ReactNode {
  const changes = otherChanges(option, own, omit);
  const roleGains = roleSwapChanges(own, option.after).filter(
    (change) => !omit.includes(change.key) && changeVerdict(change) === 'better'
  );
  if (changes.length === 0 && leading.length === 0 && roleGains.length === 0)
    return t('fittings.variations.noChanges');
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

export function unshownLosses(option: ImproveOption, shown: readonly string[]) {
  return option.lost.filter((lost) => lost.kind !== 'stat' || !shown.includes(lost.change.key));
}

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
