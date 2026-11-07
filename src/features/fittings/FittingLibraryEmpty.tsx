import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { isCapsuleGroup } from '@/engine/fittings/activeShip';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { useCharacterShipTypeId } from '@/features/character/ship';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadTypes } from '@/sde/loadSde';
import { SHIP_TREE_PATH } from './fittingRoutes';

/** The hull to start a Fitting on: all `onStartHull` reads of a picked hull. */
export type StartHull = Pick<HullEntry, 'typeId' | 'name'>;

/**
 * The flown hull, once its name is known. Null without the current-ship
 * Permission, in a pod (nothing to fit), or while it loads.
 */
function useFlownHull(): StartHull | null {
  const ship = useCharacterShipTypeId();
  const typeId = ship.status === 'ready' ? ship.typeId : null;
  const types = useKeyedLoad(typeId === null ? null : String(typeId), loadTypes).data;
  const type = typeId === null ? undefined : types?.[String(typeId)];
  if (typeId === null || !type || isCapsuleGroup(type.groupID)) return null;
  return { typeId, name: type.name };
}

/**
 * The Fittings library page with nothing in it: what a Fitting is, the Ship
 * Tree for "what can I fly?", and the ways to start one. Only here does the
 * flown hull get read, so the Open and Compare pickers never spend the call.
 */
export function FittingLibraryEmpty({
  onNewFromHull,
  onStartHull,
}: {
  onNewFromHull: () => void;
  onStartHull: (hull: StartHull) => void;
}) {
  const { t } = useTranslation();
  const flown = useFlownHull();
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
      }
    />
  );
}
