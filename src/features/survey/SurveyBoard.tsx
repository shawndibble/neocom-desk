/**
 * The Survey board: paste box, progress, charts, what's left by ore and the
 * one-tap chat message. Shared by the Mining › Survey tab and the public
 * `/share/<id>` page, so both read and behave the same; the caller supplies
 * the scans and what "add a scan" does.
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Panel, Spinner, StatChip, StatChips, TextArea } from '@/components/ui';
import {
  formatDuration,
  formatEveClock,
  surveyChatMessage,
  type SurveyMessageLabels,
} from '@/engine/survey/chatMessage';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { summarizeSurvey, type SurveyScan } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { writeToClipboard } from '@/lib/clipboard';
import { oreTone } from './surveyTones';

const LazySurveyCharts = lazy(() =>
  import('./SurveyCharts').then((m) => ({ default: m.SurveyCharts }))
);

export type AddScanResult = 'ok' | 'not-a-scan' | 'too-large' | 'failed';

interface SurveyBoardProps {
  scans: SurveyScan[];
  /** The survey's short link; null until it has been stored. */
  url: string | null;
  /** Epoch ms the link stops working; null until stored. */
  expiresAt: number | null;
  onAdd: (text: string) => Promise<AddScanResult>;
  /** Extra header controls, e.g. "New survey". */
  actions?: ReactNode;
}

type Flash = 'idle' | 'copied' | 'failed';

function useFlash(): [Flash, (next: Flash) => void] {
  const [flash, setFlash] = useState<Flash>('idle');
  return [
    flash,
    (next) => {
      setFlash(next);
      if (next !== 'idle') window.setTimeout(() => setFlash('idle'), 2000);
    },
  ];
}

function ScanPasteBox({ onAdd }: { onAdd: SurveyBoardProps['onAdd'] }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AddScanResult | null>(null);

  async function submit(value: string) {
    if (value.trim() === '') return;
    setBusy(true);
    setError(null);
    const result = await onAdd(value);
    setBusy(false);
    if (result === 'ok') setText('');
    else setError(result);
  }

  return (
    <div className="space-y-2">
      <label
        className="block text-xs font-semibold tracking-wider text-text-dim uppercase"
        htmlFor="survey-paste"
      >
        {t('survey.pasteLabel')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <TextArea
          id="survey-paste"
          mono
          rows={2}
          value={text}
          placeholder={t('survey.pastePlaceholder')}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            // A real scan goes straight in; anything else lands in the box as text.
            const pasted = event.clipboardData.getData('text/plain');
            if (parseSurveyScan(pasted) !== null) {
              event.preventDefault();
              void submit(pasted);
            }
          }}
          className="sm:flex-1"
        />
        <Button onClick={() => void submit(text)} loading={busy} disabled={text.trim() === ''}>
          {busy ? t('survey.adding') : t('survey.addScan')}
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-danger">
          {error === 'not-a-scan' && t('survey.notAScan')}
          {error === 'too-large' && t('survey.tooLarge')}
          {error === 'failed' && t('survey.saveFailed')}
        </p>
      )}
    </div>
  );
}

export function SurveyBoard({ scans, url, expiresAt, onAdd, actions }: SurveyBoardProps) {
  const { t, i18n } = useTranslation();
  const summary = useMemo(() => summarizeSurvey(scans), [scans]);
  const [chatFlash, setChatFlash] = useFlash();
  const [linkFlash, setLinkFlash] = useFlash();

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

  function copy(text: string, setFlash: (next: Flash) => void) {
    // Started inside the click so the browser still counts it as the user's gesture.
    writeToClipboard(text).then(
      () => setFlash('copied'),
      () => setFlash('failed')
    );
  }

  if (summary === null) {
    return (
      <div className="space-y-4">
        <Panel title={t('survey.title')} actions={actions}>
          <ScanPasteBox onAdd={onAdd} />
        </Panel>
        <EmptyState title={t('survey.emptyTitle')} hint={t('survey.emptyHint')} className="py-10" />
      </div>
    );
  }

  const fmt = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const left = summary.leftVolume;

  return (
    <div className="space-y-4">
      <Panel
        title={t('survey.title')}
        meta={
          <span className="text-xs text-text-dim">
            {t('survey.scanCount', { count: scans.length })}
          </span>
        }
        actions={
          <>
            {url !== null && (
              <Button
                variant="primary"
                onClick={() => copy(surveyChatMessage(summary, url, labels), setChatFlash)}
              >
                {chatFlash === 'copied'
                  ? t('survey.copiedChat')
                  : chatFlash === 'failed'
                    ? t('survey.copyFailed')
                    : t('survey.copyChat')}
              </Button>
            )}
            {url !== null && (
              <Button onClick={() => copy(url, setLinkFlash)}>
                {linkFlash === 'copied'
                  ? t('survey.copiedLink')
                  : linkFlash === 'failed'
                    ? t('survey.copyFailed')
                    : t('survey.copyLink')}
              </Button>
            )}
            {actions}
          </>
        }
      >
        <div className="space-y-4">
          <ScanPasteBox onAdd={onAdd} />

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums">
              {t('survey.minedPercent', { percent: summary.percent })}
            </span>
            <span className="text-sm text-text-dim tabular-nums">
              {t('survey.seenOf', { volume: fmt(summary.startVolume) })}
            </span>
          </div>

          <StatChips>
            <StatChip
              label={t('survey.statLeft')}
              value={t('survey.unitVolume', { value: fmt(left) })}
            />
            <StatChip
              label={t('survey.statPace')}
              value={
                summary.pace === null
                  ? '–'
                  : t('survey.unitPace', {
                      value: summary.pace.toLocaleString(i18n.language, {
                        maximumFractionDigits: 1,
                      }),
                    })
              }
            />
            <StatChip
              label={t('survey.statDone')}
              value={
                summary.finished
                  ? t('survey.finished')
                  : summary.etaAt === null
                    ? t('survey.needSecondScan')
                    : t('survey.eveTime', { time: formatEveClock(summary.etaAt) })
              }
              emphasis
            />
            <StatChip
              label={t('survey.statTimeLeft')}
              value={summary.etaAt === null ? '–' : formatDuration(summary.etaAt - summary.lastAt)}
            />
            <StatChip label={t('survey.statRocks')} value={summary.rocksLeft} />
          </StatChips>

          {scans.length > 1 && (
            <Suspense
              fallback={
                <div className="flex h-56 items-center justify-center">
                  <Spinner label={t('common.loading')} />
                </div>
              }
            >
              <LazySurveyCharts summary={summary} />
            </Suspense>
          )}

          {expiresAt !== null && (
            <p className="text-xs text-text-dim">
              {t('survey.expires', { date: new Date(expiresAt).toLocaleDateString(i18n.language) })}
            </p>
          )}
        </div>
      </Panel>

      {summary.ores.length > 0 && (
        <Panel title={t('survey.oresTitle')}>
          <ul className="space-y-2">
            {summary.ores.map((ore) => (
              <li key={ore.ore} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>{ore.ore}</span>
                  <span className="text-text-dim tabular-nums">
                    {t('survey.oreRow', {
                      rocks: t('survey.oreRocks', { count: ore.rocks }),
                      volume: formatCompactNumber(ore.volume),
                    })}
                  </span>
                </div>
                <div className="h-2 rounded-xs bg-line" aria-hidden="true">
                  <div
                    className="h-full rounded-xs"
                    style={{
                      width: `${Math.max(2, (ore.volume / left) * 100)}%`,
                      background: oreTone(summary.oreNames.indexOf(ore.ore)),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
