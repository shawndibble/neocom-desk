/**
 * The Survey board: a paste box, then one panel with progress, the chart and
 * the headline numbers, then what's left by ore. Shared by the Mining › Survey
 * tab and the public `/share/<id>` page, so both read and behave the same; the
 * caller supplies the scans and what "add a scan" does.
 *
 * Laid out as the chart-led mockup: the paste bar sits above everything, the
 * percent leads, the legend and charts come next, and the big stat tiles sit
 * under the chart they summarise.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, Panel, Spinner, TextArea } from '@/components/ui';
import { surveyChatMessage, type SurveyMessageLabels } from '@/engine/survey/chatMessage';
import { priceScans } from '@/engine/survey/pricing';
import { summarizeSurvey, type SurveyScan, type SurveySummary } from '@/engine/survey/series';
import { writeToClipboard } from '@/lib/clipboard';
import { useIsPhone } from '@/lib/useIsPhone';
import type { AddScanResult } from './scanResult';
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
  onAdd: (text: string) => Promise<AddScanResult>;
  /** Quiet controls at the foot of the panel, e.g. "New survey". */
  footerActions?: ReactNode;
  /** A line under the stats about the viewer, e.g. their own share; the public page has none. */
  viewerLine?: (summary: SurveySummary) => ReactNode;
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

/**
 * The paste bar takes whatever lands in it and sends it on at once, with no
 * button: a scan is added, and anything else says why it wasn't. The box
 * stays empty (typing does nothing), since its only job is to be pasted into.
 */
function ScanPasteBox({ onAdd }: { onAdd: SurveyBoardProps['onAdd'] }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AddScanResult | null>(null);

  async function submit(value: string) {
    if (value.trim() === '') return;
    setBusy(true);
    setError(null);
    const result = await onAdd(value);
    setBusy(false);
    if (result !== 'ok') setError(result);
  }

  return (
    <div className="space-y-1">
      <label className="sr-only" htmlFor="survey-paste">
        {t('survey.pasteLabel')}
      </label>
      <TextArea
        id="survey-paste"
        mono
        rows={1}
        aria-busy={busy}
        placeholder={t('survey.pastePlaceholder')}
        onChange={(event) => {
          event.currentTarget.value = '';
        }}
        onPaste={(event) => {
          event.preventDefault();
          void submit(event.clipboardData.getData('text/plain'));
        }}
      />
      <p role="status" className="min-h-4 text-xs text-text-dim">
        {busy && t('survey.adding')}
      </p>
      {error !== null && (
        <p role="alert" className="text-xs text-danger">
          {error === 'not-a-scan' && t('survey.notAScan')}
          {error === 'too-large' && t('survey.tooLarge')}
          {error === 'refused' && t('survey.refused')}
          {error === 'failed' && t('survey.saveFailed')}
        </p>
      )}
    </div>
  );
}

export function SurveyBoard({
  scans,
  url,
  expiresAt,
  onAdd,
  footerActions,
  viewerLine,
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
  const phone = useIsPhone();

  const labels: SurveyMessageLabels = {
    cracking: t('survey.message.cracking'),
    halfway: t('survey.message.halfway'),
    almost: t('survey.message.almost'),
    last: t('survey.message.last'),
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

  // The copy button sits in the panel header, or on a phone full width under the chart.
  const copyButton = (current: SurveySummary, link: string, fill = false) => (
    <SurveyCopyButton
      fill={fill}
      outcome={outcome}
      onCopyChat={() => copy('chat', surveyChatMessage(current, link, labels))}
      onCopyLink={() => copy('link', link)}
    />
  );

  if (summary === null) {
    return (
      <div className="space-y-4">
        <ScanPasteBox onAdd={onAdd} />
        <EmptyState title={t('survey.emptyTitle')} hint={t('survey.emptyHint')} className="py-10" />
        {footerActions}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScanPasteBox onAdd={onAdd} />

      <Panel
        title={t('survey.title')}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DataAgeBadge date={new Date(summary.lastAt)} />
            <span className="hidden text-xs text-text-dim md:inline">
              {t('survey.scanCount', { count: scans.length })}
            </span>
          </span>
        }
        actions={url !== null && !phone && copyButton(summary, url)}
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

          {url !== null && phone && copyButton(summary, url, true)}

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

      {summary.ores.length > 0 && (
        <SurveyOres
          summary={summary}
          priceNote={{ hub: orePrices.hub.systemName, compressed: orePrices.compressed }}
        />
      )}
    </div>
  );
}
