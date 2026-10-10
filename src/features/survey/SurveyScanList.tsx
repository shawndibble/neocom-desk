/**
 * Every scan a Survey holds, newest first, with the one visible control that
 * sets a bad paste aside (or takes it back). Owner-only: the board shows it
 * only when the caller offers `onSetIgnored`. The chart's right-click menu is the
 * quick way to the same action; this list is the way that works with a keyboard
 * or a finger, and the only place a removed scan can be restored from.
 */
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { formatEveClock } from '@/engine/survey/chatMessage';
import type { SurveyScan } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';

interface SurveyScanListProps {
  scans: readonly SurveyScan[];
  ignored: ReadonlySet<string>;
  onSetIgnored: (scanId: string, ignored: boolean) => void;
}

const volumeOf = (scan: SurveyScan): number => scan.rocks.reduce((sum, r) => sum + r.volume, 0);

export function SurveyScanList({ scans, ignored, onSetIgnored }: SurveyScanListProps) {
  const { t } = useTranslation();
  const rows = [...scans].reverse();
  const removed = rows.filter((s) => s.id !== undefined && ignored.has(s.id)).length;
  return (
    <details className="group rounded-xs border border-line bg-panel/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-dim touch:py-3">
        {removed > 0
          ? `${t('survey.scanList.title', { count: scans.length })} · ${t('survey.scanList.removedCount', { count: removed })}`
          : t('survey.scanList.title', { count: scans.length })}
      </summary>
      <div className="space-y-1 border-t border-line px-3 py-2">
        <p className="text-xs text-text-dim">{t('survey.scanList.hint')}</p>
        <ul className="divide-y divide-line">
          {rows.map((scan) => {
            const id = scan.id;
            const isRemoved = id !== undefined && ignored.has(id);
            return (
              <li
                key={id ?? scan.at}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm tabular-nums touch:py-2"
              >
                <span className={isRemoved ? 'text-text-dim line-through' : 'text-text'}>
                  {formatEveClock(scan.at)}
                </span>
                <span className="text-text-dim">{formatCompactNumber(volumeOf(scan))} m³</span>
                <span className="min-w-0 truncate text-text-dim">
                  {t('survey.scannedBy', { name: scan.by ?? t('survey.anonymous') })}
                </span>
                {isRemoved && (
                  <span className="text-xs text-text-dim">{t('survey.scanList.removed')}</span>
                )}
                {id !== undefined && (
                  <button
                    type="button"
                    className={`${textActionClassName()} ml-auto`}
                    onClick={() => onSetIgnored(id, !isRemoved)}
                  >
                    {isRemoved ? t('survey.scanList.restore') : t('survey.scanList.remove')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
