/**
 * Warnings about weapons and miners that hold nothing: damage goals can't
 * score an empty weapon, and Mine more compares on the best crystals.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { UnloadedWeapons } from '@/engine/fittings/improveCharges';
import { crystalParts } from '@/engine/fittings/improveMining';
import { crystalBasisOf } from './improveCrystalBasis';
import { m3sFormat } from './improveLineText';
import type { ImproveSearch } from './useImprove';

interface UnloadedProps {
  unloaded?: UnloadedWeapons | null;
  onLoadBestCharge?: () => void;
  state: ImproveSearch['state'];
  oreFamily: string;
  onLoadBestCrystal?: () => void;
}

/** Weapons holding no charge, which damage goals can't score, and Mine more's miners without the best crystals. */
export function ImproveUnloadedNotices({
  unloaded,
  onLoadBestCharge,
  state,
  oreFamily,
  onLoadBestCrystal,
}: UnloadedProps) {
  const { t } = useTranslation();
  const { basis, unloaded: unloadedCrystals, now, best } = crystalBasisOf(state);
  return (
    <>
      {unloaded && (
        <div className="space-y-2">
          <p role="status" className="text-warning text-sm">
            {t(`fittings.improve.unloaded.${unloaded.kind}`, { count: unloaded.count })}
          </p>
          {onLoadBestCharge && (
            <Button size="sm" onClick={onLoadBestCharge}>
              {t('fittings.improve.loadBestCharge')}
            </Button>
          )}
        </div>
      )}

      {unloadedCrystals && (
        <div className="space-y-2">
          <p role="status" className="text-warning text-sm">
            {t('fittings.improve.unloadedCrystals', {
              count: unloadedCrystals.count,
              family: oreFamily,
              now: m3sFormat(now),
              crystal: t('fittings.improve.crystalType', crystalParts(basis?.bestKey ?? '')),
              best: m3sFormat(best),
            })}
          </p>
          {onLoadBestCrystal && (
            <Button size="sm" onClick={onLoadBestCrystal}>
              {t('fittings.improve.loadBestCrystal')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
