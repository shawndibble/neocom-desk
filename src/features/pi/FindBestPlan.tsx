import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, Spinner } from '@/components/ui';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeFilter } from '@/engine/pi/planRecipes';
import { PricesUnavailable } from './PricesUnavailable';
import { AllProductsPanel } from './AllProductsPanel';
import { useCadence } from './cadencePref';
import {
  FindBestControls,
  PlanetTypesPanel,
  RecipeListPanel,
  type FindBestMode,
} from './FindBestSections';
import { buildAllProducts, buildFindBestView } from './findBestView';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { SlotNudge } from './PlanSlotNudge';
import { usePlanPreference } from './planTicksPref';
import { planetTypesOf } from './productPlanets';
import { ShowMeHow } from './ShowMeHow';
import { useFinderOrigin } from './usePlanetFinder';
import { usePlanAdvice } from './usePlanAdvice';
import { priceSourceLabel } from './priceSource';
import { useSellHub } from './sellHub';

interface Props {
  snapshot: GoalPlannerSnapshot;
  characterId: number;
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * "Find the best thing to build": ranked one-planet recipes for the pilot's
 * planet types and what-if planets, a planet finder per recipe, and every
 * product by tier. Reads the same recommendation model as every Plan view
 * (`usePlanAdvice`), shapes it (`buildFindBestView`) and draws it
 * (`FindBestSections`, `ShowMeHow`, `AllProductsPanel`).
 */
export function FindBestPlan({ snapshot, characterId }: Props) {
  const { t } = useTranslation();
  const preference = usePlanPreference((state) => state.value);
  const hydratePreference = usePlanPreference((state) => state.hydrate);
  useEffect(() => {
    void hydratePreference();
  }, [hydratePreference]);
  const { buybackPct } = useSellHub();
  const restartDays = useCadence((state) => state.value.restartDays);

  const state = usePlanAdvice(snapshot, characterId, preference);
  const [off, setOff] = useState<ReadonlySet<PlanetType>>(new Set());
  const [whatIf, setWhatIf] = useState<ReadonlySet<PlanetType>>(new Set());
  const [filter, setFilter] = useState<RecipeFilter>('any');
  const [mode, setMode] = useState<FindBestMode>('picks');
  const [openId, setOpenId] = useState<number | null>(null);
  // The finder's Highsec only box is remembered across cards; null follows the origin.
  const [highsecPick, setHighsecPick] = useState<boolean | null>(null);

  const colonyTypes = useMemo(
    () => snapshot.colonies.map((colony) => colony.planet_type as PlanetType),
    [snapshot.colonies]
  );
  const allTypes = useMemo(() => planetTypesOf(snapshot.pi), [snapshot.pi]);
  const origin = useFinderOrigin(
    characterId,
    snapshot.colonies.map((colony) => colony.solar_system_id)
  );

  const advice = state.status === 'ready' ? state.advice : null;
  const view = useMemo(() => {
    if (!advice) return null;
    const input = {
      rows: advice.recipeRows,
      unpriced: advice.recipes.unpriced,
      colonyTypes,
      allTypes,
      off,
      whatIf,
      filter,
      madeTypeIds: new Set(advice.colonies.flatMap((colony) => colony.sells)),
    };
    return {
      best: buildFindBestView(input),
      tiers: buildAllProducts(input, snapshot.pi),
    };
  }, [advice, colonyTypes, allTypes, off, whatIf, filter, snapshot.pi]);

  if (state.status === 'prices-failed') {
    return <PricesUnavailable />;
  }
  if (state.status === 'error') {
    return <EmptyState title={t('piPlan.find.failedTitle')} hint={t('piPlan.find.failedHint')} />;
  }
  if (state.status === 'loading' || !advice || !view) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  const { best, tiers } = view;
  const { hubName } = state;
  const priceSource = priceSourceLabel(t, hubName, buybackPct);
  const mineFor = (hosts: readonly PlanetType[]) =>
    snapshot.colonies
      .filter(
        (colony) =>
          hosts.includes(colony.planet_type as PlanetType) &&
          !off.has(colony.planet_type as PlanetType)
      )
      .map((colony) => ({
        name:
          snapshot.planetNames.get(colony.planet_id) ??
          t('pi.planetLabel', { id: colony.planet_id }),
        type: colony.planet_type as PlanetType,
      }));

  return (
    <div className="space-y-4">
      <PlanetTypesPanel
        hasColonies={best.hasColonies}
        colonyCount={snapshot.colonies.length}
        toggles={best.toggles}
        chips={best.chips}
        priceSource={priceSource}
        onToggle={(type) => {
          setOff((current) => toggled(current, type));
          setOpenId(null);
        }}
        onWhatIf={(type) => {
          setWhatIf((current) => toggled(current, type));
          setOpenId(null);
        }}
      />
      <FindBestControls
        mode={mode}
        onMode={(next) => {
          setMode(next);
          setOpenId(null);
        }}
        filter={filter}
        onFilter={(next) => {
          setFilter(next);
          setOpenId(null);
        }}
      />
      {mode === 'all' ? (
        <AllProductsPanel tiers={tiers} priceSource={priceSource} estimate />
      ) : (
        <RecipeListPanel
          cards={best.cards}
          hubName={hubName}
          priceSource={priceSource}
          estimate
          openId={openId}
          onToggle={(typeId) => setOpenId((current) => (current === typeId ? null : typeId))}
          onFind={setOpenId}
          unpricedCount={best.unpricedCount}
          emptyHint={
            advice.recipes.unpriced.length > 0 && !best.hasRecipesAtAll
              ? t('piPlan.find.noneFitPrices', { hub: hubName })
              : advice.recipeRows.length === 0
                ? t('piPlan.find.noneFit', { level: advice.rankingBasis.ccLevel })
                : filter !== 'any' && best.hasRecipesAtAll
                  ? t('piPlan.find.noneFitFilter', {
                      tier: t(filter === 'p1' ? 'piPlan.find.makeP1' : 'piPlan.find.makeP2'),
                      level: advice.rankingBasis.ccLevel,
                    })
                  : t('piPlan.find.noRecipes')
          }
          banner={
            best.alreadyBest && (
              <p
                role="status"
                className="border border-line bg-panel/85 px-3 py-2 text-xs text-text"
              >
                <b className="font-semibold text-success">{t('piPlan.find.alreadyBest')}</b>{' '}
                {t('piPlan.find.alreadyBestHint')}
              </p>
            )
          }
          renderOpen={(card, panelId) => (
            <ShowMeHow
              id={panelId}
              recipe={card.recipe}
              pi={snapshot.pi}
              origin={origin}
              mine={mineFor(card.recipe.hostTypes)}
              hubName={hubName}
              buybackPct={buybackPct}
              restartDays={restartDays}
              estimate
              highsecPick={highsecPick}
              onHighsecPick={setHighsecPick}
              onClose={() => setOpenId(null)}
            />
          )}
        />
      )}
      {advice.slots.free > 0 && (
        <Panel title={t('piPlan.find.slotsTitle')} padded={false}>
          <SlotNudge slots={advice.slots} />
        </Panel>
      )}
    </div>
  );
}
