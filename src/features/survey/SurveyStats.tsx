/**
 * The Survey's headline numbers as a row of large tiles under the chart: what
 * is left, how fast it is going, when it will be gone and how long that is.
 * Bigger than a `StatChip` on purpose: these are what the pilot reads at a
 * glance and says in fleet chat, not small counts beside a title.
 */
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import { formatDuration as formatTotalTime } from '@/lib/duration';
import { createNumberFormat, getDecimalMark } from '@/lib/numberLocale';
import { useNow } from '@/lib/useNow';
import type { SurveySummary } from '@/engine/survey/series';
import { IskAmount, Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { formatLocalClock } from './localClock';
import { useDoneAtClock, useDoneAtOverride } from './surveyPref';
import { useHydratedStore } from '@/lib/useHydratedStore';

// Accent says it's pressable; no underline, since that reads as a link to
// somewhere. The tooltip names what a press does.
const toggleClassName = `text-accent text-left whitespace-normal rounded-xs ${interactiveClassName} ${focusRingClassName}`;

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
function shortVolume(value: number): string {
  // eslint-disable-next-line no-restricted-syntax -- English K/M/B; the mark is swapped below.
  const text = value.toLocaleString('en', {
    notation: 'compact',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  // The K/M/B suffixes are EVE's shorthand in every locale, so only the mark moves.
  return getDecimalMark() === ',' ? text.replace('.', ',') : text;
}

const formatPace = createNumberFormat({ maximumFractionDigits: 1 });

export function SurveyStats({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const now = useNow();
  const clock = useDoneAtClock();
  const local = clock === 'local';
  useHydratedStore(useDoneAtOverride);
  const setClock = useDoneAtOverride((state) => state.setValue);
  // Once the field is cleared, the time it was marked cleared; until then, the estimate.
  const doneAt = summary.finished ? summary.finishedAt : summary.etaAt;
  // One row when the board is wide enough, else rows of three: never 4 + 2 or
  // 5 + 1. A finished survey has three tiles, so it is a single row at any width.
  const tileCount = summary.finished ? 3 : summary.iskLeft === null ? 5 : 6;
  const wideColumns =
    tileCount === 6 ? '@4xl:grid-cols-6' : tileCount === 5 ? '@4xl:grid-cols-5' : '';
  return (
    <div className="@container">
      <div className={`grid grid-cols-3 gap-x-2 gap-y-3 @md:gap-x-4 ${wideColumns}`}>
        {!summary.finished && (
          <Tile label={t('survey.statLeft')}>{shortVolume(summary.leftVolume)}</Tile>
        )}
        <Tile label={t('survey.statPace')}>
          {summary.pace === null ? '–' : formatPace(summary.pace)}
        </Tile>
        <Tile label={t('survey.statDone')} emphasis>
          {doneAt === null || clock === null ? (
            '–'
          ) : (
            <Tooltip content={t(local ? 'survey.showEveTime' : 'survey.showLocalTime')}>
              <button
                type="button"
                className={toggleClassName}
                onClick={() => void setClock(local ? 'eve' : 'local')}
              >
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
              {summary.etaAt === null ? '–' : formatDuration(Math.max(0, summary.etaAt - now))}
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
    </div>
  );
}
