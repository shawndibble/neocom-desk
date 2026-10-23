/**
 * Corp projects on a phone, in the shape of the Opportunities cards: checkbox,
 * item and a facts line, the profit as the right-hand hero, the blueprint line
 * underneath. A tap opens the working in place.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { formatIskCompact } from '@/lib/isk';
import { BlueprintSourceCell, ProfitCell, ProjectWorking } from './CorpProjectCells';
import type { CorpProjectRow } from './corpProjectRows';

interface CorpProjectCardsProps {
  rows: readonly CorpProjectRow[];
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  showCharacter: boolean;
}

export function CorpProjectCards({
  rows,
  selectedIds,
  onToggleSelected,
  showCharacter,
}: CorpProjectCardsProps) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul aria-label={t('industry.corpProjects.tableLabel')} className="flex flex-col">
      {rows.map((row) => {
        const open = openId === row.id;
        const selected = selectedIds.has(row.id);
        const ends = row.hoursLeft === null ? null : formatDuration(row.hoursLeft * 3600);
        return (
          <li
            key={row.id}
            className={`border-b border-line last:border-b-0 ${selected ? 'bg-accent/5' : ''}`}
          >
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)]">
              <label className="flex size-11 cursor-pointer items-center justify-center self-start">
                <Checkbox
                  checked={selected}
                  onChange={() => onToggleSelected(row.id)}
                  aria-label={t('industry.opportunitiesSelectFor', { name: row.itemName })}
                />
              </label>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : row.id)}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 py-3 pr-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{row.itemName}</span>
                  <span className="block text-[0.6875rem] text-text-dim tabular-nums">
                    {t('industry.corpProjects.unitsAndReward', {
                      units: row.remaining,
                      reward: formatIskCompact(row.project.rewardEach),
                    })}
                    {ends !== null && (
                      <>
                        {' · '}
                        <span
                          className={
                            row.hoursLeft !== null && row.hoursLeft < 48
                              ? 'text-warning'
                              : undefined
                          }
                        >
                          {t('industry.corpProjects.endsInShort', { time: ends })}
                        </span>
                      </>
                    )}
                    {showCharacter && ` · ${row.characterName}`}
                  </span>
                </span>
                <span className="flex flex-col items-end leading-tight tabular-nums">
                  <span className="text-sm font-semibold">
                    <ProfitCell row={row} />
                  </span>
                  <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">
                    {t('industry.corpProjects.profitAtCap')}
                  </span>
                </span>
                <span className="col-span-2 mt-1.5">
                  <BlueprintSourceCell row={row} />
                </span>
              </button>
            </div>
            {open && <ProjectWorking row={row} />}
          </li>
        );
      })}
    </ul>
  );
}
