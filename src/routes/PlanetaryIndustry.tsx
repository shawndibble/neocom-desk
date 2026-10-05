import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useExpiringWindowHours } from '@/features/pi/expiringWindow';
import { Button, DataAgeBadge, IconButton, PageHeader, Spinner, Tabs } from '@/components/ui';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { PiSettingsForm } from '@/features/settings/PiSettingsForm';
import * as Icon from '@/components/ui/icons';
import { PlanPanel } from '@/features/pi/PlanPanel';
import { PiExplainer } from '@/features/pi/PiExplainer';
import { goalsParam, idListParam, seedGoal } from '@/features/pi/goalsParam';
import { loadPlannableTypeIds } from '@/features/pi/products';
import type { Goal } from '@/engine/pi/goalTypes';
import { AdvisorPanel } from '@/features/pi/AdvisorPanel';
import { PiHeaderStrip } from '@/features/pi/PiHeaderStrip';
import { ColoniesTab } from '@/features/pi/colonies/ColoniesTab';
import { loadPiSnapshot } from '@/features/pi/colonies/coloniesSnapshot';
import { PiMapTab } from '@/features/pi/map/PiMapTab';
import { cx } from '@/lib/cx';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, type UrlParamCodec } from '@/lib/urlState';
import { PI_TABS } from '@/app/pageTabs';

function parsePositiveInt(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** `type` (a goal to seed) and `system` (the Advisor's system) — present only once chosen. */
function positiveIntParam(): UrlParamCodec<number | null> {
  return {
    parse: (raw) => parsePositiveInt(raw),
    serialize: (value) => (value === null ? null : String(value)),
  };
}

const PI_URL_PARAMS = {
  // The Industry "PI Plan" context menu's deep link: seeds a goal, then clears.
  type: positiveIntParam(),
  goals: goalsParam(),
  off: idListParam(),
  // A colony to open on the Colonies tab — the Goal Planner's colony links.
  colony: positiveIntParam(),
  system: positiveIntParam(),
  includeRebuilds: boolParam(),
};

/**
 * Planetary Industry: colony health from extractor expiry — the one PI field
 * ESI keeps current without opening the colony in-client — and the chain
 * planner, as peer tabs rather than two routes.
 *
 * They are one page because the plan's inputs come from the colonies and
 * because a user with no colonies at all should land on the empty state and
 * be able to step straight to a plan: buying P1 needs no extractors, so the
 * planner answers on day one. A second nav entry would also cost a row in the
 * mobile nav sheet, which is the surface that can least afford one.
 *
 * The tab is a path segment (`/planetary-industry/plan`,
 * `/planetary-industry/advisor`); every input each peer tab needs to redraw
 * its answer stays a scoped query param on top of it — Plan's goals and
 * switched-off colonies (`?goals=`, `?off=`; `?type=` seeds a goal and is
 * cleared), Advisor's system and rebuilds toggle (`?system=`,
 * `?includeRebuilds=`) — so a plan or
 * a worklist survives a reload and can be deep-linked into later. All fall
 * back silently: an unknown segment lands on `colonies` (`TabRoute`), and an
 * unknown value is handled by each param's own default rather than rendering
 * nothing.
 */
export function PlanetaryIndustry() {
  const { t } = useTranslation();
  // The pilot's own "expiring soon" lead time. Hydrated here, once, for the
  // whole page: the Colonies tab reads the same store, and a hydrate per row
  // would be a Dexie read per colony.
  const hydrateExpiringWindow = useExpiringWindowHours((state) => state.hydrate);
  useEffect(() => {
    void hydrateExpiringWindow();
  }, [hydrateExpiringWindow]);
  const [tab, setTab] = usePageTab(PI_TABS);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [
    {
      type: seedTypeId,
      goals,
      off: disabledColonies,
      colony: linkedColonyId,
      system: advisorSystemId,
      includeRebuilds,
    },
    setPiParams,
  ] = useUrlParams(PI_URL_PARAMS);
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadPiSnapshot,
    undefined,
    { cacheKey: 'planetary-industry' }
  );

  // `?type=` from the Industry "PI Plan" link becomes a goal, once, on the
  // Plan tab only, and only for a type the planner can plan.
  useEffect(() => {
    if (seedTypeId === null || tab !== 'plan') return;
    let cancelled = false;
    void loadPlannableTypeIds()
      .catch(() => new Set<number>())
      .then((plannable) => {
        if (cancelled) return;
        setPiParams({
          goals: plannable.has(seedTypeId) ? seedGoal(goals, seedTypeId) : goals,
          type: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [seedTypeId, goals, setPiParams, tab]);
  const setGoals = useCallback((next: Goal[]) => setPiParams({ goals: next }), [setPiParams]);
  const setDisabledColonies = useCallback(
    (next: number[]) => setPiParams({ off: next }),
    [setPiParams]
  );
  const setAdvisorSystemId = useCallback(
    (next: number) => setPiParams({ system: next }),
    [setPiParams]
  );
  const setIncludeRebuilds = useCallback(
    (next: boolean) => setPiParams({ includeRebuilds: next }),
    [setPiParams]
  );
  const clearLinkedColony = useCallback(() => setPiParams({ colony: null }), [setPiParams]);

  const planetsResult = data?.planetsResult ?? null;

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className={cx('mx-auto space-y-4', tab !== 'map' && 'max-w-6xl')}>
      <PageHeader
        title={t('pi.title')}
        meta={planetsResult && <DataAgeBadge date={planetsResult.fetchedAt} />}
        actions={
          <>
            <Button size="md" onClick={() => setExplainerOpen(true)}>
              {t('piPlan.newToPi')}
            </Button>
            <PageSettingsButton pageName={t('pi.title')} section="industry">
              <PiSettingsForm />
            </PageSettingsButton>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('pi.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      <PiExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} />

      <Tabs
        label={t('piPlan.tabsLabel')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'plan', label: t('piPlan.planTab') },
          { id: 'map', label: t('piPlan.mapTab') },
          { id: 'colonies', label: t('piPlan.coloniesTab') },
        ]}
      />

      <PiHeaderStrip
        colonySystemIds={(planetsResult?.data ?? []).map((planet) => planet.solar_system_id)}
        estimate={tab === 'plan' || tab === 'map'}
      />

      {tab === 'map' ? (
        <PiMapTab characterId={activeCharacterId} />
      ) : tab === 'plan' ? (
        <PlanPanel
          seedingGoal={seedTypeId !== null}
          characterId={activeCharacterId}
          goals={goals}
          onGoalsChange={setGoals}
          disabled={disabledColonies}
          onDisabledChange={setDisabledColonies}
        />
      ) : loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <ColoniesTab
          characterId={activeCharacterId}
          snapshot={data}
          loading={loading}
          error={error}
          linkedColonyId={linkedColonyId}
          onClearLinkedColony={clearLinkedColony}
        />
      )}

      {/*
        Temporary: the Advisor's own tab is gone, but its worklist stays
        reachable until it retires (#2618), below the colonies it advises on.
        Old `/advisor` links and `?system=` land here.
      */}
      {tab === 'colonies' && (
        <section aria-label={t('piPlan.advisorSection')} className="space-y-4">
          <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('piPlan.advisorSection')}
          </h2>
          <AdvisorPanel
            characterId={activeCharacterId}
            systemId={advisorSystemId}
            onSystemIdChange={setAdvisorSystemId}
            includeRebuilds={includeRebuilds}
            onIncludeRebuildsChange={setIncludeRebuilds}
          />
        </section>
      )}
    </div>
  );
}
