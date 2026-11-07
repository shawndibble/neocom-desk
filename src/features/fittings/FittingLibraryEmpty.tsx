import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { isCapsuleGroup } from '@/engine/fittings/activeShip';
import type { StartHull } from '@/engine/fittings/hullCatalogue';
import { useCharacterShipTypeId } from '@/features/character/ship';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadTypes } from '@/sde/loadSde';
import { SHIP_TREE_PATH } from './fittingRoutes';

/**
 * The flown hull, or null without the current-ship Permission or in a pod
 * (nothing to fit). `settled` once that is known, so the buttons never jump.
 */
function useFlownHull(): { hull: StartHull | null; settled: boolean } {
  const ship = useCharacterShipTypeId();
  const typeId = ship.status === 'ready' ? ship.typeId : null;
  const types = useKeyedLoad(typeId === null ? null : String(typeId), loadTypes);
  if (ship.status === 'loading') return { hull: null, settled: false };
  if (typeId === null) return { hull: null, settled: true };
  const type = types.data?.[String(typeId)];
  const settled = types.status === 'ready' || types.status === 'failed';
  if (!type || isCapsuleGroup(type.groupID)) return { hull: null, settled };
  return { hull: { typeId, name: type.name }, settled };
}

/**
 * The Fittings library page with nothing in it: what a Fitting is, the Ship
 * Tree for "what can I fly?", and the ways to start one. With the assets
 * grant the flown ship is an Active Fit row instead, so "Fit your ship" is
 * for a pilot without it.
 */
export function FittingLibraryEmpty({
  onNewFromHull,
  onStartHull,
}: {
  onNewFromHull: () => void;
  onStartHull: (hull: StartHull) => void;
}) {
  const { t } = useTranslation();
  const { hull: flown, settled } = useFlownHull();
  return (
    <EmptyState
      title={t('fittings.start.emptyTitle')}
      hint={
        <Trans
          i18nKey="fittings.start.emptyHint"
          components={{ shipTree: <Link to={SHIP_TREE_PATH} className={inlineLinkClassName} /> }}
        />
      }
      action={
        settled && (
          <div className="flex flex-wrap justify-center gap-2">
            {flown && (
              <Button variant="primary" onClick={() => onStartHull(flown)}>
                {t('fittings.start.fitFlown', { ship: flown.name })}
              </Button>
            )}
            <Button variant={flown ? 'ghost' : 'primary'} onClick={onNewFromHull}>
              {t('fittings.start.newFromHull')}
            </Button>
          </div>
        )
      }
    />
  );
}
