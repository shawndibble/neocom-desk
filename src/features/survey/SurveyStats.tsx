/**
 * The Survey's headline numbers as a row of large tiles under the chart: what
 * is left, how fast it is going, when it will be gone and how long that is.
 * Bigger than a `StatChip` on purpose: these are what the pilot reads at a
 * glance and says in fleet chat, not small counts beside a title.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import { formatDuration as formatTotalTime } from '@/lib/duration';
import type { SurveySummary } from '@/engine/survey/series';
import { IskAmount, Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { formatLocalClock } from './localClock';
import { useDoneAtLocal } from './surveyPref';

// Accent says it's pressable; no underline, since that reads as a link to
// somewhere. The tooltip names what a press does.
const toggleClassName = `text-accent rounded-xs ${interactiveClassName} ${focusRingClassName}`;

function Tile({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 border-l-2 border-line pl-3">
      <div className="text-[0.6875rem] font-semibold tracking-wider text-text-dim uppercase">
        {label}
      </div>
      <div
        data-survey-stat
        className={`text-lg font-semibold break-words tabular-nums ${emphasis ? 'text-accent' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

/** "11.0M": one fixed decimal, like the ISK tile beside it, so a big field's volume isn't cropped. */
function shortVolume(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    notation: 'compact',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function SurveyStats({ summary }: { summary: SurveySummary }) {
  const { t, i18n } = useTranslation();
  const local = useDoneAtLocal((state) => state.value);
  const setLocal = useDoneAtLocal((state) => state.setValue);
  const n = (value: number, digits = 0) =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: digits });
  // Once the field is cleared, the time it was marked cleared; until then, the estimate.
  const doneAt = summary.finished ? summary.finishedAt : summary.etaAt;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-x-3 gap-y-3">
      {!summary.finished && (
        <Tile label={t('survey.statLeft')}>{shortVolume(summary.leftVolume, i18n.language)}</Tile>
      )}
      <Tile label={t('survey.statPace')}>{summary.pace === null ? '–' : n(summary.pace, 1)}</Tile>
      <Tile label={t('survey.statDone')} emphasis>
        {doneAt === null ? (
          '–'
        ) : (
          <Tooltip content={t(local ? 'survey.showEveTime' : 'survey.showLocalTime')}>
            <button type="button" className={toggleClassName} onClick={() => void setLocal(!local)}>
              {local
                ? formatLocalClock(doneAt)
                : t('survey.eveTime', { time: formatEveClock(doneAt) })}
            </button>
          </Tooltip>
        )}
      </Tile>
      {summary.finished ? (
        // "1d 14h 36m", "12h 5m" or "55m": a unit shows only once it took that long.
        <Tile label={t('survey.statTotalTime')}>{formatTotalTime(summary.elapsedMs / 1000)}</Tile>
      ) : (
        <>
          <Tile label={t('survey.statTimeLeft')}>
            {summary.etaAt === null ? '–' : formatDuration(summary.etaAt - summary.lastAt)}
          </Tile>
          <Tile label={t('survey.statRocks')}>{summary.rocksLeft}</Tile>
          {summary.iskLeft !== null && (
            <Tile label={t('survey.statIsk')}>
              <IskAmount value={summary.iskLeft} decimals={0} />
            </Tile>
          )}
        </>
      )}
    </div>
  );
}
