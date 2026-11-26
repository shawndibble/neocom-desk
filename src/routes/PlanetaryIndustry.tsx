import { useCallback, useEffect, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { JumpBasisProvider } from '@/features/route/jumpBasis';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { hrefWithout, MAP_ONLY_PARAMS } from '@/features/pi/piPlanLink';
import { useTranslation } from 'react-i18next';
import { useExpiringWindowHours } from '@/features/pi/expiringWindow';
import {
  DataAgeBadge,
  IconButton,
  PageHeader,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
  CachedNotice,
} from '@/components/ui';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { PiSettingsForm } from '@/features/settings/PiSettingsForm';
import * as Icon from '@/components/ui/icons';
import { PlanPanel } from '@/features/pi/PlanPanel';
import { PiAdviceInputsProvider } from '@/features/pi/usePiAdviceInputs';
import { PiSnapshotProvider } from '@/features/pi/usePiSnapshot';
import { PiExplainer } from '@/features/pi/PiExplainer';
import { goalsParam, idListParam, seedGoal } from '@/features/pi/goalsParam';
import { loadPlannableTypeIds } from '@/features/pi/products';
import type { Goal } from '@/engine/pi/goalTypes';
import { GrantBanner } from '@/app/GrantNote';
import { colonyCountUnknown } from '@/features/pi/colonyFillModel';
import { PiHeaderStrip } from '@/features/pi/PiHeaderStrip';
import { ColoniesTab } from '@/features/pi/colonies/ColoniesTab';
import { loadPiSnapshot } from '@/features/pi/colonies/coloniesSnapshot';
import { PiMapTab } from '@/features/pi/map/PiMapTab';
import { useAuthFailure } from '@/stores/authFailure';
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

function positiveIntParam(): UrlParamCodec<number | null> {
  return {
    parse: (raw) => parsePositiveInt(raw),
    serialize: (value) => (value === null ? null : String(value)),
  };
}

const PI_URL_PARAMS = {
  type: positiveIntParam(),
  goals: goalsParam(),
  off: idListParam(),
  colony: positiveIntParam(),
};

export function PlanetaryIndustry() {
  const { t } = useTranslation();
  useHydratedStore(useExpiringWindowHours);
  const [tab, setTab] = usePageTab(PI_TABS);
  const tabsId = useTabsId();
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [{ type: seedTypeId, goals, off: disabledColonies, colony: linkedColonyId }, setPiParams] =
    useUrlParams(PI_URL_PARAMS);
  const { data, error, loading, hydrated, activeCharacterId, refresh, refreshCount } =
    useRouteSnapshot(loadPiSnapshot, undefined, { cacheKey: 'planetary-industry' });
  const itemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });

  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (tab === 'map') return;
    const params = new URLSearchParams(location.search);
    if (!MAP_ONLY_PARAMS.some((key) => params.has(key))) return;
    navigate(hrefWithout(location, MAP_ONLY_PARAMS), { replace: true, state: location.state });
  }, [tab, location, navigate]);
  usePopScrollRestore();

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
    <JumpBasisProvider>
      <PiSnapshotProvider characterId={activeCharacterId} reloadKey={data?.loadedAt ?? 0}>
        <PiAdviceInputsProvider characterId={activeCharacterId} reloadKey={data?.loadedAt ?? 0}>
          <ItemActionsProvider page={itemActions}>
            <div className="mx-auto max-w-page space-y-4">
              <PageHeader
                title={t('pi.title')}
                meta={
                  planetsResult && (
                    <DataAgeBadge
                      date={planetsResult.fetchedAt}
                      expiresAt={planetsResult.expiresAt}
                    />
                  )
                }
                actions={
                  <>
                    <IconButton
                      icon={<Icon.Tip />}
                      label={t('piPlan.newToPi')}
                      visibleLabel={t('piPlan.newToPi')}
                      labelAtEveryWidth
                      onClick={() => setExplainerOpen(true)}
                    />
                    <PageSettingsButton pageName={t('pi.title')} section="industry">
                      <PiSettingsForm />
                    </PageSettingsButton>
                    <IconButton
                      icon={<Icon.Refresh />}
                      label={t('pi.refresh')}
                      onClick={refresh}
                      busy={loading}
                    />
                  </>
                }
              />

              <PiExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} />

              {(data?.planetsNeedsReauth || planetsRefused) && (
                <GrantBanner characterId={activeCharacterId} endpoints={['getCharacterPlanets']} />
              )}

              {planetsResult?.fromCache && (
                <CachedNotice
                  withBadge
                  fetchedAt={planetsResult.fetchedAt}
                  refreshFailed={refreshCount > 0}
                />
              )}

              <Tabs
                tabsId={tabsId}
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
                colonySystemIds={(planetsResult?.data ?? []).map(
                  (planet) => planet.solar_system_id
                )}
                colonyCountUnknown={countUnknown}
                locationCharacterId={
                  planetsResult !== null && !countUnknown && planetsResult.data.length === 0
                    ? activeCharacterId
                    : null
                }
                estimate={tab === 'plan' || tab === 'map'}
                eveTime={tab === 'colonies'}
              />

              <TabPanel tabsId={tabsId} tabId={tab} className="space-y-4">
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
              </TabPanel>
            </div>
          </ItemActionsProvider>
        </PiAdviceInputsProvider>
      </PiSnapshotProvider>
    </JumpBasisProvider>
  );
}
