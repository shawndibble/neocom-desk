import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { hrefWithout, MAP_ONLY_PARAMS } from '@/features/pi/piPlanLink';
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
import { GrantBanner } from '@/app/GrantNote';
import { colonyCountUnknown } from '@/features/pi/colonyStripModel';
import { PiHeaderStrip } from '@/features/pi/PiHeaderStrip';
import { ColoniesTab } from '@/features/pi/colonies/ColoniesTab';
import { loadPiSnapshot } from '@/features/pi/colonies/coloniesSnapshot';
import { PiMapTab } from '@/features/pi/map/PiMapTab';
import { useAuthFailure } from '@/stores/authFailure';
import { cx } from '@/lib/cx';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { usePopScrollRestore } from '@/lib/usePopScrollRestore';
import { useUrlParams } from '@/lib/useUrlState';
import { type UrlParamCodec } from '@/lib/urlState';
import { PI_TABS } from '@/app/pageTabs';

function parsePositiveInt(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** `type` (a goal to seed) and `colony` — present only once chosen. */
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
 * `/planetary-industry/map`); every input each peer tab needs to redraw
 * its answer stays a scoped query param on top of it — Plan's goals and
 * switched-off colonies (`?goals=`, `?off=`; `?type=` seeds a goal and is
 * cleared), the chosen question (`?q=`, PlanPanel) and Find best's filter
 * (`?fb.filter=`, `?fb.mode=`, FindBestPlan), Colonies' opened colony
 * (`?colony=`), Map's open product drawer (`?product=`, which every PI
 * product name links to) — so a plan
 * survives a reload and can be deep-linked into later. All fall
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
  const [{ type: seedTypeId, goals, off: disabledColonies, colony: linkedColonyId }, setPiParams] =
    useUrlParams(PI_URL_PARAMS);
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadPiSnapshot,
    undefined,
    { cacheKey: 'planetary-industry' }
  );
  // Show info for every item name and menu on the three tabs.
  const itemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });

  // A tab switch keeps the search, so the Map's `?product=` or `?planet=`
  // would reopen its drawer on the way back: they belong to the Map alone.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (tab === 'map') return;
    const params = new URLSearchParams(location.search);
    if (!MAP_ONLY_PARAMS.some((key) => params.has(key))) return;
    navigate(hrefWithout(location, MAP_ONLY_PARAMS), { replace: true, state: location.state });
  }, [tab, location, navigate]);
  // Back from a Map drawer remounts Plan or Colonies behind a spinner, too
  // short for the browser's own restore: put the scroll back once it has grown.
  usePopScrollRestore();

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
  const clearLinkedColony = useCallback(() => setPiParams({ colony: null }), [setPiParams]);

  const planetsResult = data?.planetsResult ?? null;
  const countUnknown = colonyCountUnknown({
    needsReauth: data?.planetsNeedsReauth,
    fetchFailed: data?.planetsFetchFailed,
  });
  // Another reader (a poll, a prefetch) can be refused after this snapshot loaded; the shell
  // notice stays quiet on this page for that refusal, so the page banner must show it.
  const failure = useAuthFailure((state) => state.failure);
  const planetsRefused =
    failure?.kind === 'request' &&
    failure.characterId === activeCharacterId &&
    failure.endpointId === 'getCharacterPlanets';

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <ItemActionsProvider page={itemActions}>
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

        {(data?.planetsNeedsReauth || planetsRefused) && (
          <GrantBanner
            characterId={activeCharacterId}
            endpoints={['getCharacterPlanets']}
            title={t('pi.reauthTitle')}
            hint={t('pi.reauthHint')}
            actionLabel={t('pi.reauthAction')}
          />
        )}

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
          colonyCountUnknown={countUnknown}
          locationCharacterId={
            planetsResult !== null && !countUnknown && planetsResult.data.length === 0
              ? activeCharacterId
              : null
          }
          estimate={tab === 'plan' || tab === 'map'}
          eveTime={tab === 'colonies'}
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
            onRetry={refresh}
          />
        )}
      </div>
    </ItemActionsProvider>
  );
}
