import { useCallback, useId } from 'react';
import { useAsyncLoad, useKeyedLoad } from '@/lib/useAsyncLoad';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, buttonClassName, Spinner, TypeIcon } from '@/components/ui';
import { marketItemUrl } from '@/engine/market/urlState';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { planTargetForItem } from '@/features/industry/blueprintCatalog';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { industryTabHref } from '@/features/industry/industryTabs';
import type { ShipTreeShip } from '@/sde/types';
import { shipTreeBlueprintCatalog } from './shipTreeCatalogs';
import { ownedBlueprintSummary } from './shipTreeModel';

export function BlueprintTab({
  ship,
  characterId,
}: {
  ship: ShipTreeShip;
  characterId: number | null;
}) {
  const { t } = useTranslation();
  const needsCharacterId = useId();
  const catalogLoad = useAsyncLoad(shipTreeBlueprintCatalog);
  const catalog = catalogLoad.status === 'failed' ? 'failed' : (catalogLoad.data ?? null);
  const loadOwned = useCallback(
    () => loadCharacterBlueprints(characterId ?? 0).then((result) => result.cached?.data ?? null),
    [characterId]
  );
  const ownedBlueprints = useKeyedLoad(
    characterId === null ? null : String(characterId),
    loadOwned
  ).data;

  if (!catalog) return <Spinner size="sm" />;
  if (catalog === 'failed')
    return <p className="text-sm text-text-dim">{t('ships.info.blueprint.loadFailed')}</p>;
  const planTarget = planTargetForItem(catalog, ship.typeID);
  if (!planTarget) return <p className="text-sm text-text-dim">{t('ships.info.blueprint.none')}</p>;

  const bpTypeID = planTarget.blueprintTypeID;
  const bpName = catalog.byBlueprintTypeID.get(bpTypeID)?.blueprint.name ?? '';
  const mine = ownedBlueprints ? ownedBlueprintSummary(ownedBlueprints, bpTypeID) : null;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-3">
        <TypeIcon typeId={bpTypeID} size={64} width={48} height={48} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text">{bpName}</div>
          {mine && (mine.originals > 0 || mine.copies > 0) && (
            <div className="text-success">
              {[
                mine.originals > 0 && t('ships.info.blueprint.ownOriginal'),
                mine.copies > 0 && t('ships.info.blueprint.ownCopies', { count: mine.copies }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={bpcSourcingHref(bpTypeID)} className={buttonClassName({ size: 'sm' })}>
          {t('ships.info.blueprint.findCopy')}
        </Link>
        <Link to={marketItemUrl(bpTypeID, '')} className={buttonClassName({ size: 'sm' })}>
          {t('ships.info.blueprint.viewInMarket')}
        </Link>
        {characterId !== null ? (
          <Link
            to={`${industryTabHref('plans')}?product=${planTarget.productTypeID}`}
            className={buttonClassName({ size: 'sm', variant: 'primary' })}
          >
            {t('ships.info.blueprint.planBuild')}
          </Link>
        ) : (
          <Button size="sm" variant="primary" aria-disabled aria-describedby={needsCharacterId}>
            {t('ships.info.blueprint.planBuild')}
          </Button>
        )}
      </div>
      {characterId === null && (
        <p id={needsCharacterId} className="text-text-dim">
          {t('ships.info.blueprint.planNeedsCharacter')}
        </p>
      )}
    </div>
  );
}
