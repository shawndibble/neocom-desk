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
import { diffFittingStats } from '@/engine/fittings/variationDelta';

/** How many stat changes a row spells out before counting the rest. */
const CHANGES_SHOWN = 4;

/** The swap's other changes; `onOpen` makes the "N other stats" tail a button that spells them out. */
export function changeLine(
  t: TFunction,
  option: ImproveOption | RejectedOption,
  own: FittingStats,
  all = false,
  onOpen?: () => void,
  omit: readonly string[] = []
): ReactNode {
  // What the swap does first; the CPU, powergrid and calibration it takes after.
  const changes = diffFittingStats(own, option.after)
    .changes.filter((change) => !omit.includes(change.key))
    .sort((a, b) => Number(isResource(a.key)) - Number(isResource(b.key)));
  if (changes.length === 0) return t('fittings.variations.noChanges');
  // One stat per row, so a long list reads down instead of running on as a sentence.
  const shown = changes.slice(0, all ? undefined : CHANGES_SHOWN);
  const rest = changes.length - shown.length;
  const label = rest > 0 ? t('fittings.makeItFit.otherStats', { count: rest }) : null;
  return (
    <>
      <StatChangeList changes={shown} />
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

/** Each stat the swap makes worse, with its before → after, so the loss has a size: one per row. */
export function lostLine(t: TFunction, option: ImproveOption): ReactNode {
  const stats = option.lost.flatMap((lost) => (lost.kind === 'stat' ? [lost.change] : []));
  return (
    <>
      {stats.length > 0 && <StatChangeList changes={stats} />}
      {option.lost.map((lost) =>
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
