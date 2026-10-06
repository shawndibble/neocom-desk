/**
 * "See all products": every planetary product by tier, with what one planet
 * earns where the model has a one-planet figure and "needs N planets" where it
 * does not. Faded tiles need a planet type the toggles leave out; the fade is
 * backed by text, never colour alone.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, Panel, TypeIcon } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { formatIsk } from '@/lib/isk';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { cx } from '@/lib/cx';
import { EstimateBadge, TierChip } from './DirectiveRow';
import type { ProductTile, TierColumn } from './findBestView';

const TIER_KEY = ['raw', 'processed', 'refined', 'specialized', 'advanced'] as const;

function Tile({ tile }: { tile: ProductTile }) {
  const { t } = useTranslation();
  const { comparison } = tile;
  const cmpText = comparison
    ? comparison.isReference
      ? t('piPlan.find.allBestSimple', { type: t(`pi.planetType.${comparison.versus.planetType}`) })
      : t(`piPlan.find.cmp.${comparison.verdict}`, {
          item: comparison.versus.name,
          type: t(`pi.planetType.${comparison.versus.planetType}`),
        })
    : null;
  const tone =
    !comparison || comparison.isReference || comparison.verdict === 'same'
      ? 'text-text-dim'
      : comparison.verdict === 'better'
        ? 'text-success'
        : 'text-warning';
  return (
    <li className={cx('flex items-start gap-2 px-3 py-2', !tile.reachable && 'opacity-60')}>
      <TypeIcon typeId={tile.typeId} size={32} width={24} height={24} className="mt-0.5" />
      <div className="min-w-0 space-y-0.5 text-xs">
        <MarketItemLink typeId={tile.typeId}>
          <b className="font-semibold">{tile.name}</b>
        </MarketItemLink>
        <p className="text-text-dim tabular-nums">
          {tile.perDay !== null && (
            <>
              <b className="font-semibold text-text">
                <IskAmount value={tile.perDay} decimals={0} />
              </b>
              {t('piPlan.make.perDay')} ·{' '}
            </>
          )}
          {tile.planets !== null &&
            (tile.planets <= 1
              ? t('piPlan.find.allOnePlanet')
              : t('piPlan.find.allNeedsPlanets', { count: tile.planets }))}
          {tile.isNew && (
            <>
              {' · '}
              <span className="text-warning">{t('piPlan.find.allNew')}</span>
            </>
          )}
        </p>
        {tile.tier === 0 ? (
          <p className="text-warning">
            <HintText content={t('piPlan.find.rawHint')}>{t('piPlan.find.rawLabel')}</HintText>
          </p>
        ) : cmpText && comparison ? (
          <p className={tone}>
            <HintText
              content={t('piPlan.find.cmpHint', {
                item: comparison.versus.name,
                isk: formatIsk(comparison.versus.iskPerDay, 0),
                type: t(`pi.planetType.${comparison.versus.planetType}`),
              })}
            >
              {cmpText}
            </HintText>
          </p>
        ) : null}
        {!tile.reachable && <p className="sr-only">{t('piPlan.find.allUnreachable')}</p>}
      </div>
    </li>
  );
}

export function AllProductsPanel({
  tiers,
  priceSource,
  estimate,
}: {
  tiers: readonly TierColumn[];
  priceSource: string;
  estimate: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('piPlan.find.allTitle')}
      wrapMeta
      meta={
        <span className="text-[0.6875rem] text-text-dim max-md:basis-full">
          {t('piPlan.find.picksMeta', { source: priceSource })}
        </span>
      }
      actions={estimate ? <EstimateBadge /> : undefined}
      padded={false}
    >
      <div className="grid divide-y divide-line lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {tiers.map((column) => (
          <section key={column.tier} aria-label={t(`piPlan.find.tier.${TIER_KEY[column.tier]}`)}>
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <TierChip tier={column.tier} />
              <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t(`piPlan.find.tier.${TIER_KEY[column.tier]}`)}
              </h3>
              <span className="ml-auto text-[0.6875rem] text-text-dim tabular-nums">
                {t('piPlan.find.canMake', {
                  count: column.reachableCount,
                  total: column.items.length,
                })}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {column.items.map((tile) => (
                <Tile key={tile.typeId} tile={tile} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
        {t('piPlan.find.allFoot')}
      </p>
    </Panel>
  );
}
