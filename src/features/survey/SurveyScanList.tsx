import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  textActionClassName,
} from '@/components/ui';
import { formatEveClock } from '@/engine/survey/chatMessage';
import { scanVolume, type SurveyScan } from '@/engine/survey/series';
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

export function SurveyScanList({ scans, ignored, onSetIgnored }: SurveyScanListProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const rows = [...scans].reverse();
  const removed = rows.filter((s) => s.id !== undefined && ignored.has(s.id)).length;
  return (
    <CollapsiblePanel
      title={
        removed > 0
          ? t('survey.scanList.titleWithRemoved', { count: scans.length, removed })
          : t('survey.scanList.title', { count: scans.length })
      }
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      labels={{
        show: t('survey.scanList.title', { count: scans.length }),
        hide: t('survey.scanList.title', { count: scans.length }),
      }}
    >
      <div className="space-y-1">
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
                  {t('survey.scanList.volume', {
                    volume: formatCompactNumber(scanVolume(scan.rocks)),
                  })}
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
    </CollapsiblePanel>
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
