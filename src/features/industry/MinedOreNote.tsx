import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { db } from '@/db';
import { minedOreCoverage, minedTypeIds } from '@/engine/industry/minedOreCoverage';
import { utcDay } from '@/engine/localDay';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadReprocessing } from '@/sde/loadSde';

/** How far back "ore you mine" looks. */
const MINED_WINDOW_DAYS = 90;

/**
 * Under the Materials table while a mineral is still bought: which ores the
 * pilot mined recently (every Character on this device) refine into each short
 * mineral, and which minerals none do. Read-only; no units, m³ or ISK.
 */
export function MinedOreNote({
  shortMinerals,
  onBuyOre,
}: {
  /** Mineral type ids the plan still buys. */
  shortMinerals: readonly number[];
  /** Opens "Buy ore instead". */
  onBuyOre: () => void;
}) {
  const { t } = useTranslation();
  const histories = useLiveQuery(() => db.miningLedgerHistory.toArray());
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [coverage, setCoverage] = useState<ReturnType<typeof minedOreCoverage> | 'none' | null>(
    null
  );
  const shortKey = shortMinerals.join(',');

  useEffect(() => {
    if (!histories) return;
    let cancelled = false;
    const mined = minedTypeIds(histories, utcDay(), MINED_WINDOW_DAYS);
    void (async () => {
      const reprocessing = await loadReprocessing();
      const result = minedOreCoverage({ short: shortMinerals, mined, reprocessing });
      const ids = [...shortMinerals, ...Object.values(result.byMineral).flat()];
      const loaded = await loadTypeNames([...new Set(ids)]);
      if (cancelled) return;
      setNames(loaded);
      setCoverage(mined.size === 0 ? 'none' : result);
    })().catch(() => {
      if (!cancelled) setCoverage('none');
    });
    return () => {
      cancelled = true;
    };
    // `shortKey` stands for `shortMinerals`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histories, shortKey]);

  if (!histories) return null;
  const name = (id: number) => names.get(id) ?? `#${id}`;
  return (
    <div className="mt-3 rounded-xs border border-line bg-panel-2 px-2.5 py-2 text-xs text-text-dim">
      <p className="font-semibold text-text">{t('industry.minedOre.title')}</p>
      {coverage === 'none' ? (
        <p className="mt-1">{t('industry.minedOre.empty')}</p>
      ) : (
        coverage && (
          <ul className="mt-1 space-y-0.5">
            {shortMinerals
              .filter((m) => coverage.byMineral[m])
              .map((m) => (
                <li key={m}>
                  <span className="text-text">{name(m)}</span>
                  {': '}
                  {coverage.byMineral[m].map(name).join(', ')}
                </li>
              ))}
            {coverage.buyThese.length > 0 && (
              <li>
                {t('industry.minedOre.buyThese', {
                  minerals: coverage.buyThese.map(name).join(', '),
                })}{' '}
                <button type="button" className={textActionClassName()} onClick={onBuyOre}>
                  {t('industry.buyOre.action')}
                </button>
              </li>
            )}
          </ul>
        )
      )}
    </div>
  );
}
