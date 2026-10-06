/**
 * The Map on a phone: the planet types as a grid of 44px toggles, then one
 * tier at a time as a list (a tier switcher), then the full map in a container
 * that scrolls sideways on its own. Tapping a product opens the bottom sheet;
 * tapping the one you traced again clears it.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, SegmentedControl, TypeIcon } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  selectedRowClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { cx } from '@/lib/cx';
import { onPlanLinkClick } from '@/features/industry/planLinkClick';
import { clickOnSpace } from '@/lib/clickOnSpace';
import { formatIskCompact } from '@/lib/isk';
import * as Icon from '@/components/ui/icons';
import { PlanetImage } from '../PlanetImage';
import { comparisonSentence, figureSentence, planetName, tierName, verdictGlyph } from './mapText';
import { ChainTileFigure } from './ChainTileFigure';
import type { MapGraph, MapTier, ProductFigure } from './mapModel';

const TIERS: readonly MapTier[] = [0, 1, 2, 3, 4];

export interface MapPhoneProps {
  graph: MapGraph;
  owned: ReadonlySet<PlanetType>;
  noColonies: boolean;
  ticked: ReadonlySet<PlanetType>;
  whatIfType: PlanetType | null;
  litIds: ReadonlySet<number>;
  newIds: ReadonlySet<number>;
  tracedId: number | null;
  pickRanks: ReadonlyMap<number, number>;
  figureOf: (typeId: number) => ProductFigure;
  onPlanet: (type: PlanetType) => void;
  onProduct: (typeId: number) => void;
  /** The product's PI detail URL: a row is a real link. */
  productHref: (typeId: number) => string;
  /** The what-if line, picks and so on, rendered between the toggles and the list. */
  between: ReactNode;
  /** The full map, rendered when asked for. */
  fullMap: ReactNode;
}

export function MapPhone(props: MapPhoneProps) {
  const { graph, owned, ticked, litIds, newIds } = props;
  const { t } = useTranslation();
  const [tier, setTier] = useState<MapTier>(() =>
    props.tracedId === null ? 1 : graph.byId.get(props.tracedId)!.tier || 1
  );
  const [showFull, setShowFull] = useState(false);
  const shown = graph.tiers[tier].filter((p) => litIds.has(p.typeId) || newIds.has(p.typeId));
  const hidden = graph.tiers[tier].length - shown.length;

  return (
    <div className="space-y-3 p-3">
      <div role="group" aria-label={t('piMap.planetsTitle')} className="grid grid-cols-4 gap-1.5">
        {graph.planetTypes.map((type) => {
          const have = owned.has(type) || props.noColonies;
          const pressed = have ? ticked.has(type) : props.whatIfType === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={pressed}
              aria-label={
                owned.has(type)
                  ? t('piMap.planetHaveShort', { name: planetName(t, type) })
                  : have
                    ? t('piMap.planetToggle', { name: planetName(t, type) })
                    : t('piMap.planetMissing', { name: planetName(t, type) })
              }
              onClick={() => props.onPlanet(type)}
              className={cx(
                'relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xs border px-0.5 py-1 text-[11px] font-semibold tracking-widest uppercase',
                interactiveClassName,
                focusRingClassName,
                pressed
                  ? have
                    ? toggleChipStateClassName(true)
                    : 'border-map-whatif bg-map-whatif/10 text-map-whatif'
                  : toggleChipStateClassName(false)
              )}
            >
              <PlanetImage
                type={type}
                size={32}
                className={cx(!pressed && 'brightness-[.45] grayscale')}
              />
              <span aria-hidden="true">{planetName(t, type)}</span>
              {pressed && (
                <Icon.Done
                  size={Icon.ICON_SIZE.sm}
                  aria-hidden="true"
                  className="absolute top-0.5 right-1"
                />
              )}
            </button>
          );
        })}
      </div>

      {props.between}

      <section aria-labelledby="pi-map-phone-tier">
        <SegmentedControl<string>
          label={t('piMap.phone.tierSwitcher')}
          fill
          uppercase={false}
          value={String(tier)}
          onChange={(v) => setTier(Number(v) as MapTier)}
          options={TIERS.map((value) => ({ value: String(value), label: `P${value}` }))}
        />
        <h3
          id="pi-map-phone-tier"
          className="mt-3 text-[11px] font-semibold tracking-widest text-text-dim uppercase"
        >
          {t('piMap.phone.tierHeading', {
            name: tierName(t, tier),
            tier,
            sub: t(`piMap.tier.${tier}.sub`),
          })}
        </h3>
        <ul className="mt-1.5 divide-y divide-line border-y border-line">
          {shown.map((product) => {
            const figure = props.figureOf(product.typeId);
            const glyph = verdictGlyph(figure);
            const rank = props.pickRanks.get(product.typeId);
            const traced = props.tracedId === product.typeId;
            const isNew = newIds.has(product.typeId);
            const sentence = [
              product.tier === 0
                ? t('piMap.rawYields', {
                    types: product.hosts.map((type) => planetName(t, type)).join(', '),
                  })
                : comparisonSentence(t, figure),
              figureSentence(t, figure),
            ].filter(Boolean);
            return (
              <li key={product.typeId}>
                <Link
                  to={props.productHref(product.typeId)}
                  data-map-key={`p:${product.typeId}`}
                  aria-current={traced ? 'true' : undefined}
                  onClick={onPlanLinkClick(() => props.onProduct(product.typeId))}
                  onKeyDown={clickOnSpace}
                  className={cx(
                    'flex min-h-11 w-full items-center gap-2 px-1 py-1.5 text-left text-sm [@media(hover:hover)]:hover:bg-panel-2',
                    interactiveClassName,
                    focusRingClassName,
                    traced && selectedRowClassName,
                    isNew && 'bg-map-whatif/10'
                  )}
                >
                  <TypeIcon typeId={product.typeId} size={64} width={28} height={28} />
                  <span className="min-w-0 flex-1">
                    {/* The card's title carries the accent cue at rest (DESIGN.md §6c "Phone cards"). */}
                    <span className="block">
                      {rank !== undefined && (
                        <span className="mr-1.5 text-[11px] font-bold text-warning">#{rank}</span>
                      )}
                      {isNew && (
                        <span className="mr-1.5 text-[11px] font-bold text-map-whatif">
                          +<span className="sr-only">{t('piMap.phone.newSr')}</span>
                        </span>
                      )}
                      <span className="text-accent">{product.name}</span>
                    </span>
                    <span className="block text-xs text-text-dim">{sentence.join(' · ')}</span>
                  </span>
                  {figure.kind === 'unranked' && (figure.whatIf ?? figure.chain) && (
                    <ChainTileFigure
                      iskPerDay={(figure.whatIf ?? figure.chain)!.iskPerDay}
                      className="shrink-0 text-xs"
                    />
                  )}
                  {glyph && figure.kind === 'ranked' && (
                    <span
                      aria-hidden="true"
                      className="flex shrink-0 items-center gap-1 text-xs tabular-nums"
                    >
                      <span
                        className={cx(
                          'font-bold',
                          glyph === '▲' && 'text-success',
                          glyph === '▼' && 'text-danger',
                          glyph === '≈' && 'text-text-dim'
                        )}
                      >
                        {glyph}
                      </span>
                      {formatIskCompact(figure.iskPerDay)}
                      {figure.needsCcLevel && (
                        <span className="rounded-xs border border-warning/60 px-1 text-[10px] leading-[14px] font-semibold text-warning">
                          {t('piMap.needsCcShort', { level: figure.needsCcLevel })}
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <p className="mt-1.5 text-xs text-text-dim">
            {t('piMap.phone.hidden', { count: hidden })}
          </p>
        )}
      </section>

      <Button className="w-full" aria-expanded={showFull} onClick={() => setShowFull((v) => !v)}>
        {showFull ? t('piMap.phone.hideFull') : t('piMap.phone.showFull')}
      </Button>
      {showFull && (
        <div className="overflow-x-auto rounded-xs border border-line">{props.fullMap}</div>
      )}
    </div>
  );
}
