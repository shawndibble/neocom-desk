import { useTranslation } from 'react-i18next';
import { Button, Spinner, TypeIcon } from '@/components/ui';
import type { LoadedFitting } from '@/engine/fittings/load';
import { popularFitLoad, type PopularFit } from '@/engine/fittings/popularFits';
import { formatAge } from '@/lib/age';
import { formatIskCompact } from '@/lib/isk';
import { useNow } from '@/lib/useNow';
import { usePopularFits } from './popularFits';

interface PopularFitsPanelProps {
  shipTypeId: number;
  hullName: string;
  onOpen: (loaded: LoadedFitting) => void;
}

/** Distinct modules, in rack order, for a row's icon strip. */
function distinctModuleTypeIds(fit: PopularFit): number[] {
  return [...new Set(fit.parts.modules.map((module) => module.typeId))];
}

/**
 * Popular fits (issue #2327): the hull's recent zKillboard losses grouped
 * into distinct fits, any of which opens in the editor. A zKillboard or ESI
 * failure is a one-line note — the rest of the page works without it.
 */
export function PopularFitsPanel({ shipTypeId, hullName, onOpen }: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const result = usePopularFits(shipTypeId);
  const now = useNow();

  return (
    <section aria-label={t('fittings.popular.title')} className="space-y-2">
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('fittings.popular.title')}
      </h3>
      {result === null ? (
        <Spinner size="sm" label={t('fittings.popular.loading')} />
      ) : !result.ok ? (
        <p role="status" className="text-xs text-warning">
          {t('fittings.popular.failed')}
        </p>
      ) : result.fits.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.popular.empty')}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {result.fits.map((fit, index) => (
            <li
              key={fit.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-panel px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {t('fittings.popular.losses', { count: fit.count })}
                  <span className="text-text-dim">
                    {fit.lastSeen !== null &&
                      ` · ${t('fittings.popular.lastSeen', {
                        age: formatAge(Math.max(0, now - Date.parse(fit.lastSeen)), t),
                      })}`}
                    {fit.value !== null &&
                      ` · ${t('fittings.popular.value', { value: formatIskCompact(fit.value) })}`}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-0.5" aria-hidden="true">
                  {distinctModuleTypeIds(fit).map((typeId) => (
                    <TypeIcon key={typeId} typeId={typeId} size={32} width={20} height={20} />
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  onOpen(
                    popularFitLoad(
                      fit,
                      t('fittings.popular.fitName', { hullName, rank: index + 1 })
                    )
                  )
                }
              >
                {t('fittings.popular.open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
