/**
 * The Survey board: one panel with progress, the chart and the headline
 * numbers, what the caller puts under it (the moon tax), then what's left by ore. Shared by the Mining › Survey
 * tab and the public `/s/<id>` page, so both read and behave the same; the
 * caller supplies the scans and what "add a scan" does.
 *
 * Laid out as the chart-led mockup: the percent leads, the legend and charts come next, and the big stat tiles sit
 * under the chart they summarise.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { surveyChatMessage, type SurveyMessageLabels } from '@/engine/survey/chatMessage';
import { priceScans } from '@/engine/survey/pricing';
import { summarizeSurvey, type SurveyScan, type SurveySummary } from '@/engine/survey/series';
import { writeToClipboard } from '@/lib/clipboard';
import { SurveyCopyButton, type CopyOutcome } from './SurveyCopyButton';
import { SurveyLegend } from './SurveyLegend';
import { SurveyOres } from './SurveyOres';
import { SurveyStats } from './SurveyStats';
import { useOrePrices } from './useOrePrices';

const LazySurveyCharts = lazy(() =>
  import('./SurveyCharts').then((m) => ({ default: m.SurveyCharts }))
);

interface SurveyBoardProps {
  scans: SurveyScan[];
  /** The survey's short link; null until it has been stored. */
  url: string | null;
  /** Epoch ms the link stops working; null until stored. */
  expiresAt: number | null;
  /** Quiet controls at the foot of the panel, e.g. "New survey". */
  footerActions?: ReactNode;
  /** A line under the stats about the viewer, e.g. their own share; the public page has none. */
  viewerLine?: (summary: SurveySummary) => ReactNode;
  /** A section under the panel, before the ores, e.g. the moon tax; gets the same summary. */
  afterPanel?: (summary: SurveySummary) => ReactNode;
  /** The panel's title; the public page sets one that doesn't repeat its page heading. */
  panelTitle?: string;
}

/** What the copy button last copied, shown on it for two seconds. */
function useCopyOutcome(): [CopyOutcome, (next: CopyOutcome) => void] {
  const [outcome, setOutcome] = useState<CopyOutcome>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    outcome,
    (next) => {
      window.clearTimeout(timer.current);
      setOutcome(next);
      if (next !== null) timer.current = window.setTimeout(() => setOutcome(null), 2000);
    },
  ];
}

export function SurveyBoard({
  scans,
  url,
  expiresAt,
  footerActions,
  viewerLine,
  afterPanel,
  panelTitle,
}: SurveyBoardProps) {
  const { t, i18n } = useTranslation();
  const oreNames = useMemo(() => scans.flatMap((s) => s.rocks.map((r) => r.ore)), [scans]);
  const orePrices = useOrePrices(oreNames);
  // The scanner's own ISK column is not trusted: rocks are valued at market.
  const summary = useMemo(
    () => summarizeSurvey(priceScans(scans, orePrices.prices)),
    [scans, orePrices.prices]
  );
  const [outcome, setOutcome] = useCopyOutcome();

  const labels: SurveyMessageLabels = {
    heading: t('survey.message.heading'),
    done: t('survey.message.done'),
    waiting: t('survey.message.waiting'),
    left: t('survey.message.left'),
    more: t('survey.message.more'),
    cleared: t('survey.message.cleared'),
  };

  function copy(what: 'chat' | 'link', text: string) {
    // Started inside the click so the browser still counts it as the user's gesture.
    writeToClipboard(text).then(
      () => setOutcome({ what, result: 'copied' }),
      () => setOutcome({ what, result: 'failed' })
    );
  }

  // The copy button sits in the panel header, on a phone too.
  const copyButton = (current: SurveySummary, link: string) => (
    <SurveyCopyButton
      outcome={outcome}
      onCopyChat={() => copy('chat', surveyChatMessage(current, link, labels))}
      onCopyLink={() => copy('link', link)}
    />
  );

  if (summary === null) {
    return (
      <div className="space-y-4">
        <EmptyState title={t('survey.emptyTitle')} hint={t('survey.emptyHint')} className="py-10" />
        {footerActions}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={panelTitle ?? t('survey.title')}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DataAgeBadge date={new Date(summary.lastAt)} />
            <span className="hidden text-xs text-text-dim md:inline">
              {t('survey.scanCount', { count: scans.length })}
            </span>
          </span>
        }
        actions={url !== null && copyButton(summary, url)}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums">
              {t('survey.minedPercent', { percent: summary.percent })}
            </span>
            <span className="text-sm text-text-dim tabular-nums">
              {t('survey.seenOf', {
                volume: Math.round(summary.startVolume).toLocaleString(i18n.language),
              })}
            </span>
          </div>

          {scans.length <= 1 && (
            <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-line px-4 text-center text-sm text-text-dim">
              {t('survey.addSecondScan')}
            </div>
          )}

          {scans.length > 1 && (
            <>
              <SurveyLegend summary={summary} />
              <Suspense
                fallback={
                  <div className="flex h-56 items-center justify-center">
                    <Spinner label={t('common.loading')} />
                  </div>
                }
              >
                <LazySurveyCharts summary={summary} />
              </Suspense>
            </>
          )}

          <SurveyStats summary={summary} />

          {viewerLine?.(summary)}

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {expiresAt !== null && (
              <p className="text-xs text-text-dim">
                {t('survey.expires', {
                  date: new Date(expiresAt).toLocaleDateString(i18n.language),
                })}
              </p>
            )}
            {footerActions}
          </div>
        </div>
      </Panel>

      {afterPanel?.(summary)}

      {summary.ores.length > 0 && (
        <SurveyOres
          summary={summary}
          priceNote={{ hub: orePrices.hub.systemName, compressed: orePrices.compressed }}
        />
      )}
    </div>
  );
}
