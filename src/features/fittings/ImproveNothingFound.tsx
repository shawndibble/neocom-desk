/**
 * What a finished search with no rows says: why nothing turned up, a way to
 * search again when it stopped early, and the closest swaps that broke a
 * guardrail.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { ImproveGoal, ImproveResult } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improveKeys';
import type { FittingStats } from '@/engine/fittings/types';
import { changeLine } from './improveChangeLines';
import { brokeText, moveLine, oreLine } from './improveLineText';
import type { ImproveSettings } from './improveSettings';
import { MakeItFitSection } from './MakeItFitSection';
import type { ImproveLabels } from './useImproveLabels';

interface Props {
  goal: ImproveGoal;
  result: ImproveResult;
  before: FittingStats;
  fitTotal: number | null;
  /** A blank hull has no fitted module to vary: the message must not talk about one. */
  noModules: boolean;
  settings: ImproveSettings;
  labels: ImproveLabels;
  onSearchAgain: () => void;
  /** Switches Reach to Rework and searches again; absent: no nudge. */
  onSearchRework?: () => void;
}

export function ImproveNothingFound({
  goal,
  result,
  before,
  fitTotal,
  noModules,
  settings,
  labels,
  onSearchAgain,
  onSearchRework,
}: Props) {
  const { t } = useTranslation();
  const nudge = settings.reach === 'upgrade' && !noModules && onSearchRework !== undefined;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {t(noModules ? 'fittings.improve.nothing.noModules' : `fittings.improve.nothing.${goal}`)}
      </p>
      {result.stopped && (
        <div className="space-y-2">
          <p className="text-text-dim text-xs">
            {t('fittings.improve.partial', { checked: result.checked })}
          </p>
          <Button size="sm" onClick={onSearchAgain}>
            {t('fittings.improve.searchAgain')}
          </Button>
        </div>
      )}
      {result.rejected.length > 0 && (
        <MakeItFitSection heading={t('fittings.improve.closest')}>
          <ul className="space-y-1">
            {result.rejected.map((option) => {
              const line = moveLine(t, goal, settings.hold, option, before);
              return (
                <li key={optionKey(option)} className="border-line rounded-xs border p-2 text-sm">
                  <p className="font-medium">{labels.swapLabel(option)}</p>
                  {goal === 'mining' && <p className="text-xs">{oreLine(t, option, before)}</p>}
                  {line && <p className="text-xs">{line}</p>}
                  <p className="text-text-dim text-xs">{changeLine(t, option, before)}</p>
                  <p className="text-warning text-xs">{brokeText(t, option, settings, fitTotal)}</p>
                </li>
              );
            })}
          </ul>
        </MakeItFitSection>
      )}
      {nudge && (
        <div className="border-line space-y-2 rounded-xs border p-2">
          <p className="text-sm">{t('fittings.improve.reworkNudge.text')}</p>
          <Button variant="primary" size="sm" onClick={onSearchRework}>
            {t('fittings.improve.reworkNudge.button')}
          </Button>
          <p className="text-text-dim text-xs">{t('fittings.improve.reworkNudge.time')}</p>
        </div>
      )}
      {!noModules && !nudge && (
        <p className="text-text-dim text-xs">{t(`fittings.improve.widen.${settings.reach}`)}</p>
      )}
    </div>
  );
}
