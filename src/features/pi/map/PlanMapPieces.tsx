/** The pieces of the map panel: detail body, legend, picks strip, what-if line, board. */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { formatList } from '@/lib/listFormat';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { withArticle } from '../article';
import { onPlanLinkClick } from '@/features/industry/planLinkClick';
import { clickOnSpace } from '@/lib/clickOnSpace';
import { Button, InfoTooltip, Spinner, Tooltip, TypeIcon } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { clampIskZero, formatIsk, formatIskCompact, formatIskCompactSigned } from '@/lib/isk';
import { WhatIfChainCards } from '../BiggerChainsPanel';
import { CcLevelTag } from '../CcLevelTag';
import { PlanetImage } from '../PlanetImage';
import { AddPlanetDetail, ProductDetail } from './MapDetail';
import { ChainEstimateMark } from './ChainTileFigure';
import { MapBoard } from './MapBoard';
import { ColonyRichness } from './ColonyRichness';
import { unlockedBy } from './mapModel';
import { planetName, VERDICT_TONE } from './mapText';
import { buildProductDetail } from './productDetailModel';
import type { PlanMapState } from './usePlanMapState';

/** The detail panel's content: a colony's richness, the what-if planet, the traced product, or the empty hint. */
export function PlanMapDetailBody({ s }: { s: PlanMapState }) {
  const { t } = useTranslation();
  const {
    richnessColony,
    graph,
    docked,
    dropPlanet,
    showWhatIf,
    whatIfAdvice,
    advice,
    whatIfTypes,
    whatIf,
    ticked,
    whatIfRecipe,
    owned,
    finder,
    openProduct,
    productHref,
    closePlanet,
    setWhatIfTicks,
    chainsOn,
    pi,
    hasFreeSlot,
    chainsPending,
    whatIfCards,
    traced,
    trace,
    pickRanks,
    picks,
    figureOf,
    colonyNames,
    colonySales,
    clearTrace,
    context,
  } = s;
  if (richnessColony) {
    return (
      <ColonyRichness
        planetId={richnessColony.planetId}
        type={richnessColony.type}
        resources={graph.tiers[0]
          .filter((raw) => raw.hosts.includes(richnessColony.type))
          .map((raw) => ({ typeId: raw.typeId, name: raw.name }))}
        onClose={docked ? dropPlanet : undefined}
      />
    );
  }
  if (showWhatIf && whatIfAdvice) {
    const weakest = [...advice.colonies]
      .filter((c) => c.todayPerDay !== null)
      .sort((a, b) => a.todayPerDay! - b.todayPerDay!)[0];
    return (
      <AddPlanetDetail
        graph={graph}
        types={whatIfTypes}
        unlockedIds={unlockedBy(graph, whatIf, ticked).productIds}
        recipe={whatIfRecipe}
        oneHostCount={
          whatIfAdvice.recipes.recipes.filter(
            (r) => r.hostTypes.some((h) => whatIf.has(h)) && !r.hostTypes.some((h) => owned.has(h))
          ).length
        }
        slots={advice.slots}
        weakest={
          weakest
            ? {
                name: weakest.name ?? t('pi.planetLabel', { id: weakest.planetId }),
                perDay: weakest.todayPerDay!,
              }
            : null
        }
        finder={finder}
        onTraceRecipe={openProduct}
        productHref={productHref}
        onClose={() => {
          setWhatIfTicks(new Set());
          closePlanet();
        }}
        chains={
          chainsOn && pi ? (
            !hasFreeSlot ? (
              <p className="text-xs text-text-dim">
                {t('piMap.add.chainsNoSlot', {
                  count: whatIfTypes.length,
                  free: advice.slots.free,
                })}
              </p>
            ) : chainsPending ? (
              <div className="flex items-center gap-2 text-xs text-text-dim">
                <Spinner size="sm" label={t('piMap.add.chainsPricing')} />
                {t('piMap.add.chainsPricing')}
              </div>
            ) : whatIfCards.length === 0 ? (
              <p className="text-xs text-text-dim">{t('piMap.add.chainsNone')}</p>
            ) : (
              <WhatIfChainCards
                types={whatIfTypes}
                cards={whatIfCards}
                advice={advice}
                pi={pi}
                stacked
              />
            )
          ) : undefined
        }
      />
    );
  }
  if (traced && trace) {
    const rank = pickRanks.get(traced.id) ?? null;
    const pick = picks.picks.find((p) => p.typeId === traced.id) ?? null;
    return (
      <ProductDetail
        graph={graph}
        typeId={traced.id}
        figure={figureOf(traced.id)}
        trace={trace}
        rank={rank}
        pickPerDay={pick?.perDay ?? null}
        pickKind={picks.kind}
        owned={owned}
        colonyNames={colonyNames}
        finder={finder}
        view={buildProductDetail({
          graph,
          typeId: traced.id,
          trace,
          figure: figureOf(traced.id),
          colonies: colonySales,
          ccLevel: advice.rankingBasis.ccLevel,
        })}
        onClearTrace={clearTrace}
      />
    );
  }
  return <p className="text-xs text-text-dim">{t('piMap.detail.empty', { context })}</p>;
}

/** What a tile's figure and marks mean, where the tiles are: the help drawer has the long form. */
export function MapLegend({ s }: { s: PlanMapState }) {
  const { t } = useTranslation();
  const { marks, phone } = s;
  if (!marks.verdict && !marks.estimate) return null;
  return (
    <div
      role="group"
      aria-label={t('piMap.legend.label')}
      className={cx(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6875rem] font-normal tracking-normal text-text-dim normal-case',
        // Beside the title it gives way first and wraps, so "Planet map" never truncates.
        phone ? 'border-b border-line px-3 py-1.5' : 'min-w-0 flex-1 basis-0'
      )}
    >
      {marks.verdict && (
        <>
          <span>{t('piMap.legend.figure')}</span>
          <span aria-hidden="true">·</span>
          {(
            [
              ['▲', 'piMap.legend.better'],
              ['≈', 'piMap.legend.same'],
              ['▼', 'piMap.legend.worse'],
            ] as const
          ).map(([glyph, key]) => (
            <span key={glyph}>
              <span aria-hidden="true" className={cx('font-bold', VERDICT_TONE[glyph])}>
                {glyph}
              </span>{' '}
              {t(key)}
            </span>
          ))}
        </>
      )}
      {marks.verdict && marks.estimate && <span aria-hidden="true">·</span>}
      {marks.estimate && (
        <span className="inline-flex items-center gap-1">
          <ChainEstimateMark />
          {t('piMap.legend.estimate')}
        </span>
      )}
    </div>
  );
}

export function MapLegendTip({ s }: { s: PlanMapState }) {
  const { t } = useTranslation();
  const { marks } = s;
  if (!marks.verdict && !marks.estimate) return null;
  return (
    <InfoTooltip
      label={t('piMap.legend.label')}
      content={[
        marks.verdict &&
          `${t('piMap.legend.figure')} · ▲ ${t('piMap.legend.better')} · ≈ ${t('piMap.legend.same')} · ▼ ${t('piMap.legend.worse')}`,
        marks.estimate && `${t('piMap.legend.estimate')}`,
      ]
        .filter(Boolean)
        .join('\n')}
    />
  );
}

export function PicksStrip({ s }: { s: PlanMapState }) {
  const { t } = useTranslation();
  const { picks, pricesFailed, productHref, traced, toggleProduct, preference, phone, clearTrace } =
    s;
  return (
    <div
      role="group"
      aria-label={t('piMap.picksLabel')}
      className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line px-3 py-1.5 text-xs"
    >
      <span className={eyebrowClassName}>
        {picks.kind === 'recipes' ? t('piMap.picksRecipes') : t('piMap.picksTitle')}
      </span>
      {picks.kind === 'none' ? (
        <span className="text-text-dim">
          {t(pricesFailed ? 'piMap.picksNoPrices' : 'piMap.picksNone')}
        </span>
      ) : (
        <>
          {picks.picks.map((pick, i) => (
            <span key={pick.typeId} className="inline-flex items-center gap-1.5">
              <Tooltip content={t('common.iskExact', { amount: formatIsk(pick.perDay, 0) })}>
                <Link
                  to={productHref(pick.typeId)}
                  aria-current={traced?.id === pick.typeId ? 'true' : undefined}
                  onClick={(event) => onPlanLinkClick(() => toggleProduct(pick.typeId))(event)}
                  onKeyDown={clickOnSpace}
                  className={cx(
                    'inline-flex h-7 items-center gap-1.5 rounded-xs border border-line px-2 text-xs max-md:h-9',
                    interactiveClassName,
                    focusRingClassName,
                    traced?.id === pick.typeId
                      ? selectedRowClassName
                      : '[@media(hover:hover)]:hover:border-line-bright [@media(hover:hover)]:hover:bg-panel-2'
                  )}
                >
                  <span className="text-[0.6875rem] font-bold text-warning">#{i + 1}</span>
                  <TypeIcon typeId={pick.typeId} size={64} width={20} height={20} />
                  <span>{pick.name}</span>
                  <span
                    className={cx(
                      clampIskZero(pick.perDay, 0) < 0 ? 'text-isk-neg' : 'text-isk-pos',
                      'tabular-nums'
                    )}
                  >
                    {picks.kind === 'rebuild'
                      ? formatIskCompactSigned(pick.perDay)
                      : formatIskCompact(pick.perDay)}
                    {t('piMap.perDaySuffix')}
                    {/* A link cannot hold a focusable IskAmount; the tooltip below and this text carry the exact figure. */}
                    <span className="sr-only">
                      {' '}
                      {t('common.iskExact', { amount: formatIsk(pick.perDay, 0) })}
                    </span>
                  </span>
                </Link>
              </Tooltip>
              {pick.needsCcLevel && <CcLevelTag level={pick.needsCcLevel} />}
            </span>
          ))}
          <InfoTooltip
            label={t('piMap.picksNoteLabel')}
            content={
              picks.kind === 'rebuild'
                ? t('piMap.picksNoteRebuild', {
                    preference: t(
                      preference === 'haul' ? 'piMap.preferenceHaul' : 'piMap.preferenceIsk'
                    ),
                  })
                : t('piMap.picksNoteRecipes')
            }
          />
        </>
      )}
      {traced && (
        <Button size={phone ? 'md' : 'sm'} className="ml-auto" onClick={clearTrace}>
          {t('piMap.clearTrace')}
        </Button>
      )}
    </div>
  );
}

export function WhatIfLine({ s }: { s: PlanMapState }) {
  const { t } = useTranslation();
  const { activeWhatIf, unlock, whatIfRecipe, previewed } = s;
  const active = activeWhatIf.size > 0 && unlock ? [...activeWhatIf].sort() : null;
  const best = whatIfRecipe ? ` ${t('piMap.whatIfBest', { name: whatIfRecipe.name })}` : '';
  // Nothing shows until a what-if type is ticked or hovered. A hover floats over the board's top
  // edge instead of taking a row, so hovering never shifts the page (#2796).
  return (
    <div className="relative text-xs text-text-dim" aria-live="polite" data-testid="map-whatif">
      {active && unlock ? (
        <div
          className={cx(
            'flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line px-3 py-1.5 text-text',
            previewed !== null && 'absolute inset-x-0 top-0 z-20 bg-panel shadow-lg shadow-black/50'
          )}
        >
          {active.map((type) => (
            <PlanetImage key={type} type={type} size={28} />
          ))}
          <span className="text-[0.6875rem] font-semibold tracking-widest text-map-whatif uppercase">
            {active.length === 1
              ? t('piMap.whatIfTitle', { aType: withArticle(planetName(t, active[0])) })
              : t('piMap.whatIfTitleMany', {
                  types: formatList(active.map((type) => planetName(t, type))),
                })}
          </span>
          <span>
            {(unlock.productIds.length === 0
              ? t('piMap.whatIfNothing')
              : t('piMap.whatIfUnlocks', { count: unlock.productIds.length })) +
              (previewed === null ? best : '')}
          </span>
          <span aria-hidden="true" className="flex flex-wrap gap-0.5">
            {unlock.productIds.slice(0, 12).map((id) => (
              <TypeIcon key={id} typeId={id} size={32} width={22} height={22} />
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function PlanMapBoard({ s }: { s: PlanMapState }) {
  const {
    graph,
    owned,
    noColonies,
    ticked,
    needTypes,
    litIds,
    newIds,
    boardWhatIf,
    whatIf,
    trace,
    traced,
    pickRanks,
    pickPlanets,
    colonyNames,
    figureOf,
    clickPlanet,
    setPreview,
    toggleProduct,
    productHref,
  } = s;
  return (
    <MapBoard
      graph={graph}
      owned={owned}
      noColonies={noColonies}
      ticked={ticked}
      needTypes={needTypes}
      litIds={litIds}
      newIds={newIds}
      whatIfTypes={boardWhatIf}
      whatIfTicked={whatIf}
      trace={trace}
      dimOthers={traced?.explicit ?? false}
      pickRanks={pickRanks}
      pickPlanets={pickPlanets}
      colonyNames={colonyNames}
      figureOf={figureOf}
      onPlanet={clickPlanet}
      onPreview={setPreview}
      onProduct={toggleProduct}
      productHref={productHref}
    />
  );
}
