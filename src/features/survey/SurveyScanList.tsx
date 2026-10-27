/**
 * Every scan a Survey holds, newest first, with the one visible control that
 * sets a bad paste aside (or takes it back). Owner-only: the board shows it
 * only when the caller offers `onSetIgnored`. The chart's right-click menu is the
 * quick way to the same action; this list is the way that works with a keyboard
 * or a finger, and the only place a removed scan can be restored from.
 */
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger, textActionClassName } from '@/components/ui';
import { formatEveClock } from '@/engine/survey/chatMessage';
import type { SurveyScan } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatCount } from '@/lib/formatCount';

interface SurveyScanListProps {
  scans: readonly SurveyScan[];
  ignored: ReadonlySet<string>;
  onSetIgnored: (scanId: string, ignored: boolean) => void;
}

interface OreLine {
  ore: string;
  rocks: number;
  volume: number;
}

/** One line per ore in a scan: how many rocks and how much m³, biggest first. */
function oreLines(scan: SurveyScan): OreLine[] {
  const byOre = new Map<string, OreLine>();
  for (const rock of scan.rocks) {
    const line = byOre.get(rock.ore) ?? { ore: rock.ore, rocks: 0, volume: 0 };
    line.rocks += 1;
    line.volume += rock.volume;
    byOre.set(rock.ore, line);
  }
  return [...byOre.values()].sort((a, b) => b.volume - a.volume);
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
          ? t('survey.scanList.titleWithRemoved', { count: scans.length, removed })
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
                <span className="text-text-dim">
                  {t('survey.scanList.volume', { volume: formatCompactNumber(volumeOf(scan)) })}
                </span>
                <span className="min-w-0 truncate text-text-dim">
                  {t('survey.scannedBy', { name: scan.by ?? t('survey.anonymous') })}
                </span>
                {isRemoved && (
                  <span className="text-xs text-text-dim">{t('survey.scanList.removed')}</span>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={`${textActionClassName()} ml-auto`}>
                      {t('survey.scanList.details')}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    aria-label={t('survey.scanList.detailsLabel', {
                      time: formatEveClock(scan.at),
                    })}
                    className="w-72 p-3 text-sm"
                  >
                    <ScanDetails scan={scan} />
                  </PopoverContent>
                </Popover>
                {id !== undefined && (
                  <button
                    type="button"
                    className={textActionClassName()}
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

function ScanDetails({ scan }: { scan: SurveyScan }) {
  const { t } = useTranslation();
  const lines = oreLines(scan);
  if (lines.length === 0)
    return <p className="text-text-dim">{t('survey.scanList.detailsEmpty')}</p>;
  return (
    <ul className="space-y-1 tabular-nums">
      {lines.map((line) => (
        <li key={line.ore} className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-text">{line.ore}</span>
          <span className="text-text-dim">
            {t('survey.scanList.detailsRocks', { count: line.rocks })}
          </span>
          <span className="w-24 text-right text-text-dim">
            {t('survey.scanList.volume', {
              volume: formatCount(line.volume),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
