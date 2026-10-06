/**
 * "See all products": every planetary product by tier, with what one planet
 * earns where the model has a one-planet figure (a raw: selling it as extracted), a multi-planet chain
 * estimate for a P3 or P4 once it is priced, and "needs N planets" where there
 * is neither. Faded tiles need a planet type the toggles leave out; the fade is
 * backed by text, never colour alone.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, Panel, TypeIcon } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { PiProductLink } from './PiProductLink';
import { ComparisonText } from './ComparisonText';
import { cx } from '@/lib/cx';
import { EstimateBadge, TierChip } from './DirectiveRow';
import type { ChainEstimateView } from './chainEstimateModel';
import { chainAssumptions } from './chainEstimateText';
import type { ProductTile, TierColumn } from './findBestView';
import type { ChainEstimateOf } from './useChainEstimates';

const TIER_KEY = ['raw', 'processed', 'refined', 'specialized', 'advanced'] as const;

function Tile({ tile, chain }: { tile: ProductTile; chain: ChainEstimateView | null }) {
  const { t } = useTranslation();
  const { comparison } = tile;
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
        <PiProductLink typeId={tile.typeId}>
          <b className="font-semibold">{tile.name}</b>
        </PiProductLink>
        <p className="text-text-dim tabular-nums">
          {tile.perDay !== null && (
            <>
              <b className="font-semibold text-text">
                <IskAmount value={tile.perDay} decimals={0} />
              </b>
              {t('piPlan.make.perDay')} ·{' '}
            </>
          )}
          {tile.noPrice && <>{t('piPlan.find.rawNoPrice')} · </>}
          {chain ? (
            <>
              <b className="font-semibold text-text">
                <IskAmount value={chain.iskPerDay} decimals={0} />
              </b>
              {t('piPlan.make.perDay')} ·{' '}
              <HintText content={chainAssumptions(t, chain)}>
                {t('piShared.chain.tileLabel', { count: chain.planets.length })}
              </HintText>
            </>
          ) : (
            tile.planets !== null &&
            (tile.planets <= 1
              ? t('piPlan.find.allOnePlanet')
              : t('piPlan.find.allNeedsPlanets', { count: tile.planets }))
          )}
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
        ) : comparison ? (
          <p className={tone}>
            <ComparisonText
              comparison={comparison}
              referenceText={t('piPlan.find.allBestSimple', {
                type: t(`pi.planetType.${comparison.versus.planetType}`),
              })}
            />
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
  chainOf,
}: {
  tiers: readonly TierColumn[];
  priceSource: string;
  estimate: boolean;
  /** P3/P4 multi-planet chain estimates; a tile still being priced reads "needs N planets". */
  chainOf?: ChainEstimateOf;
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-line px-3 py-2">
              <TierChip tier={column.tier} />
              <h3 className="text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase">
                {t(`piPlan.find.tier.${TIER_KEY[column.tier]}`)}
              </h3>
              <span className="ml-auto text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
                {t('piPlan.find.canMake', {
                  count: column.reachableCount,
                  total: column.items.length,
                })}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {column.items.map((tile) => (
                <Tile
                  key={tile.typeId}
                  tile={tile}
                  chain={tile.perDay === null ? (chainOf?.(tile.typeId) ?? null) : null}
                />
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
