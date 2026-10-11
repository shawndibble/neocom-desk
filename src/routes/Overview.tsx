/**
 * The Overview: the pilot's own summary of what matters to them.
 *
 * A grid of widgets the pilot chose, sized and ordered (`features/overview/
 * widgets`), each drawn as a Number or a List and each in one of five states.
 * It replaces a fixed board of thirteen domain cards plus an alerts column;
 * everything on the page is now the pilot's choice, and the default is only a
 * starting point.
 *
 * This route is wiring. It waits for every store it reads to hydrate (so the
 * first-run prompt never flashes before the saved layout has loaded), decides
 * which layout to draw (the saved one, a migration of the old hidden-card and
 * card-order settings for a returning pilot, or the first-run prompt), mounts
 * the page's reads once above the grid, and hands the header its controls.
 *
 * Scoped to the header Character; All characters is an Overview-only choice in
 * the header switcher, honoured by the widgets whose reads can sum.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@/components/ui';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { getLastKnownSpSummary } from '@/stores/characterSp';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useIsPhone } from '@/lib/useIsPhone';
import { OverviewHeader } from '@/features/overview/OverviewHeader';
import { useOverviewCardOrder } from '@/features/overview/cardOrder';
import { useOverviewHiddenCards } from '@/features/overview/hiddenCards';
import { useFeedStore } from '@/features/overview/widgets/data/feedStoreContext';
import { OverviewRefreshProvider } from '@/features/overview/widgets/data/OverviewRefreshProvider';
import { WidgetDataProvider } from '@/features/overview/widgets/data/WidgetDataProvider';
import { useOverviewEdit } from '@/features/overview/widgets/editContext';
import { makeWidgetId } from '@/features/overview/widgets/ids';
import { removeWidget, type OverviewLayout } from '@/features/overview/widgets/layout';
import { useOverviewLayout } from '@/features/overview/widgets/layoutStore';
import { isReturningPilot, migrateFromCards } from '@/features/overview/widgets/migrate';
import { OverviewEditProvider } from '@/features/overview/widgets/OverviewEditProvider';
import { basicsLayout } from '@/features/overview/widgets/roles';
import { useOverviewScopeAll } from '@/features/overview/widgets/scope';
import { distinctKinds, visibleWidgets } from '@/features/overview/widgets/visibility';
import { WidgetGrid } from '@/features/overview/widgets/WidgetGrid';

/** The header's SP chips read the skills feed, so it is mounted whatever the layout holds. */
const ALWAYS_FEEDS = ['skills'] as const;

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex justify-center py-16">{children}</div>;
}

/**
 * Until the Role chooser lands, a first visit offers the one answer that needs
 * no question: the four base widgets.
 */
function FirstRun({ onBasics }: { onBasics: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="grid max-w-xl gap-3 rounded-xs border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">{t('overview.firstRun.title')}</h2>
      <p className="text-xs text-text-dim">{t('overview.firstRun.body')}</p>
      <span>
        <Button variant="primary" onClick={onBasics}>
          {t('overview.firstRun.basics')}
        </Button>
      </span>
    </section>
  );
}

interface BoardProps {
  characterId: number;
  layout: OverviewLayout;
  showNew: boolean;
  onLayoutChange: (next: OverviewLayout) => void;
}

/** Everything below the providers: the header, sub-nav and grid. */
function Board({ characterId, layout, showNew, onLayoutChange }: BoardProps) {
  const store = useFeedStore();
  const feeds = useSyncExternalStore(store.subscribe, store.get);
  const headerAll = useOverviewScopeAll((state) => state.value);
  const { editing } = useOverviewEdit();

  const skills = feeds.skills?.data ?? null;
  const lastKnownSp = getLastKnownSpSummary(characterId);

  const onRemove = useCallback(
    (id: string) => onLayoutChange(removeWidget(layout, id)),
    [layout, onLayoutChange]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={characterId}
        totalSp={skills?.totalSp ?? lastKnownSp.totalSp}
        unallocatedSp={skills?.skillsResult?.data?.unallocated_sp ?? lastKnownSp.unallocatedSp}
        actions={<OverviewHeader widgets={layout.widgets} />}
      />
      <OverviewSubNav />
      <WidgetGrid
        widgets={layout.widgets}
        showNew={showNew}
        headerAll={headerAll}
        editing={editing}
        onRemove={onRemove}
      />
    </div>
  );
}

export function Overview() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const activeHydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const stored = useOverviewLayout((state) => state.value);
  const layoutHydrated = useOverviewLayout((state) => state.hydrated);
  const hydrateLayout = useOverviewLayout((state) => state.hydrate);
  const setLayout = useOverviewLayout((state) => state.setValue);
  // The old board's two settings: read for a returning pilot's first layout,
  // and to know whether the New tags apply. Only their read side is kept.
  const hidden = useOverviewHiddenCards((state) => state.value);
  const hiddenHydrated = useOverviewHiddenCards((state) => state.hydrated);
  const hydrateHidden = useOverviewHiddenCards((state) => state.hydrate);
  const order = useOverviewCardOrder((state) => state.value);
  const orderHydrated = useOverviewCardOrder((state) => state.hydrated);
  const hydrateOrder = useOverviewCardOrder((state) => state.hydrate);
  const scopeHydrated = useOverviewScopeAll((state) => state.hydrated);
  const hydrateScope = useOverviewScopeAll((state) => state.hydrate);

  useEffect(() => {
    void hydrateLayout();
    void hydrateHidden();
    void hydrateOrder();
    void hydrateScope();
  }, [hydrateLayout, hydrateHidden, hydrateOrder, hydrateScope]);

  const hydrated =
    activeHydrated && layoutHydrated && hiddenHydrated && orderHydrated && scopeHydrated;
  const returning = isReturningPilot(hidden, order);

  // A returning pilot with no saved layout gets their old board, as widgets,
  // drawn at once and saved once.
  const migrated = useMemo(
    () =>
      hydrated && stored === null && returning
        ? migrateFromCards({ hidden, order }, makeWidgetId)
        : null,
    [hydrated, stored, returning, hidden, order]
  );
  const layout = stored ?? migrated;
  const saved = useRef(false);
  useEffect(() => {
    if (migrated === null || saved.current) return;
    saved.current = true;
    void setLayout(migrated);
  }, [migrated, setLayout]);

  const onLayoutChange = useCallback((next: OverviewLayout) => void setLayout(next), [setLayout]);

  const widgets = layout?.widgets;
  const kinds = useMemo(
    () => (widgets ? distinctKinds(visibleWidgets(widgets, isPhone)) : []),
    [widgets, isPhone]
  );

  if (!hydrated) {
    return (
      <Centered>
        <Spinner label={t('common.loading')} />
      </Centered>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (layout === null) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <CharacterHeader characterId={activeCharacterId} totalSp={null} unallocatedSp={null} />
        <OverviewSubNav />
        <FirstRun onBasics={() => onLayoutChange(basicsLayout(makeWidgetId))} />
      </div>
    );
  }

  return (
    <OverviewRefreshProvider>
      <OverviewEditProvider>
        <WidgetDataProvider kinds={kinds} always={ALWAYS_FEEDS}>
          <Board
            characterId={activeCharacterId}
            layout={layout}
            showNew={returning}
            onLayoutChange={onLayoutChange}
          />
        </WidgetDataProvider>
      </OverviewEditProvider>
    </OverviewRefreshProvider>
  );
}
