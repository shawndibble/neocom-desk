/**
 * Ship Info › Blueprint: the hull's blueprint, where a copy can be had, and
 * a Build Plan for the hull. With the active Character's blueprints read,
 * says whether they already own it. A hull no blueprint makes (special
 * editions, rewards) says so instead.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, buttonClassName, Spinner, TypeIcon } from '@/components/ui';
import { marketItemUrl } from '@/engine/market/urlState';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { planTargetForItem, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { industryTabHref } from '@/features/industry/industryTabs';
import type { CharacterBlueprint } from '@/esi/endpoints';
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
  const [catalog, setCatalog] = useState<BlueprintCatalog | 'failed' | null>(null);
  const [owned, setOwned] = useState<{
    characterId: number;
    blueprints: readonly CharacterBlueprint[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    shipTreeBlueprintCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        if (!cancelled) setCatalog('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    loadCharacterBlueprints(characterId)
      .then((result) => {
        const data = result.cached?.data;
        if (!cancelled && data) setOwned({ characterId, blueprints: data });
      })
      // Ownership is a nicety here; an unreadable list just leaves it unsaid.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (!catalog) return <Spinner size="sm" />;
  if (catalog === 'failed')
    return <p className="text-sm text-text-dim">{t('ships.info.blueprint.loadFailed')}</p>;
  const planTarget = planTargetForItem(catalog, ship.typeID);
  if (!planTarget) return <p className="text-sm text-text-dim">{t('ships.info.blueprint.none')}</p>;

  const bpTypeID = planTarget.blueprintTypeID;
  const bpName = catalog.byBlueprintTypeID.get(bpTypeID)?.blueprint.name ?? '';
  const mine =
    owned && owned.characterId === characterId
      ? ownedBlueprintSummary(owned.blueprints, bpTypeID)
      : null;

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
          <Button size="sm" variant="primary" disabled>
            {t('ships.info.blueprint.planBuild')}
          </Button>
        )}
      </div>
      {characterId === null && (
        <p className="text-text-dim">{t('ships.info.blueprint.planNeedsCharacter')}</p>
      )}
    </div>
  );
}
