import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Navigate } from 'react-router-dom';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { guarded } from '@/app/routeChunks';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { DangerBanner } from '@/features/notifications/DangerBanner';
import { WarBanner } from '@/features/wars/WarBanner';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  OverviewCachedNotice,
  OverviewCustomize,
  OverviewDataAge,
  OverviewMoreMenu,
  OverviewNext,
} from '@/features/overview/OverviewHeader';
import { useOverviewSummary } from '@/features/overview/useOverviewSummary';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { usePageScopeControl } from '@/features/overview/widgets/usePageScopeControl';
import { OverviewRefreshProvider } from '@/features/overview/widgets/data/OverviewRefreshProvider';
import { WidgetDataProvider } from '@/features/overview/widgets/data/WidgetDataProvider';
import { useOverviewEdit } from '@/features/overview/widgets/editContext';
import { makeWidgetId } from '@/features/overview/widgets/ids';
import type { OverviewLayout } from '@/features/overview/widgets/layout';
import { useOverviewLayout } from '@/features/overview/widgets/layoutStore';
import {
  isReturningPilot,
  migrateFromCards,
  useOverviewCardOrder,
  useOverviewHiddenCards,
} from '@/features/overview/widgets/migrate';
import { OverviewEditProvider } from '@/features/overview/widgets/OverviewEditProvider';
import { useFirstRunReady } from '@/features/overview/widgets/useFirstRunReady';
import { distinctKinds, visibleWidgets } from '@/features/overview/widgets/visibility';
import { WidgetGrid } from '@/features/overview/widgets/WidgetGrid';

const CustomizeBar = lazy(() =>
  guarded(() => import('@/features/overview/widgets/CustomizeBar')).then((m) => ({
    default: m.CustomizeBar,
  }))
);
const Gallery = lazy(() =>
  guarded(() => import('@/features/overview/widgets/Gallery')).then((m) => ({
    default: m.Gallery,
  }))
);
const PhoneCustomizeList = lazy(() =>
  guarded(() => import('@/features/overview/widgets/PhoneCustomizeList')).then((m) => ({
    default: m.PhoneCustomizeList,
  }))
);
const RoleChooser = lazy(() =>
  guarded(() => import('@/features/overview/widgets/RoleChooser')).then((m) => ({
    default: m.RoleChooser,
  }))
);
const RoleChooserDialog = lazy(() =>
  guarded(() => import('@/features/overview/widgets/RoleChooser')).then((m) => ({
    default: m.RoleChooserDialog,
  }))
);

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex justify-center py-16">{children}</div>;
}

interface BoardProps {
  characterId: number;
  layout: OverviewLayout;
}

function Board({ characterId, layout }: BoardProps) {
  const edit = useOverviewEdit();
  const { editing } = edit;
  const isPhone = useIsPhone();
  const narrow = useIsNarrow();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const summary = useOverviewSummary(layout.widgets);
  const pageScope = usePageScopeControl();

  return (
    <div className="mx-auto max-w-page space-y-4">
      <CharacterHeader
        characterId={characterId}
        overview
        scope={pageScope && <CharacterFilterControl {...pageScope} />}
        actions={
          <>
            <OverviewNext summary={summary} />
            {narrow ? <OverviewMoreMenu summary={summary} /> : <OverviewCustomize />}
          </>
        }
      />
      <OverviewSubNav trailing={narrow ? undefined : <OverviewDataAge summary={summary} />} />
      <DangerBanner />
      <WarBanner characterId={characterId} />
      <OverviewCachedNotice summary={summary} />
      {editing && (
        <Suspense fallback={<Spinner block="panel" />}>
          <CustomizeBar onAdd={() => setGalleryOpen(true)} onRoles={() => setRolesOpen(true)} />
        </Suspense>
      )}
      {editing && isPhone && layout.widgets.length > 0 ? (
        <Suspense fallback={<Spinner block="panel" />}>
          <PhoneCustomizeList />
        </Suspense>
      ) : (
        <WidgetGrid
          widgets={layout.widgets}
          editing={editing}
          onAdd={() => setGalleryOpen(true)}
          onRoles={() => setRolesOpen(true)}
        />
      )}
      <Suspense fallback={null}>
        {galleryOpen && <Gallery open onClose={() => setGalleryOpen(false)} />}
        {rolesOpen && (
          <RoleChooserDialog
            open
            onClose={() => setRolesOpen(false)}
            onChoose={(next) => {
              edit.replace(next);
              setRolesOpen(false);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export function Overview() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const activeHydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const stored = useOverviewLayout((state) => state.value);
  const setLayout = useOverviewLayout((state) => state.setValue);
  const hidden = useOverviewHiddenCards((state) => state.value);
  const order = useOverviewCardOrder((state) => state.value);

  const storesHydrated = useHydratedStore(
    useOverviewLayout,
    useOverviewHiddenCards,
    useOverviewCardOrder
  );
  const hydrated = activeHydrated && storesHydrated;
  const returning = isReturningPilot(hidden, order);
  const firstRunReady = useFirstRunReady(hydrated);

  const migrated = useMemo(
    () =>
      hydrated && firstRunReady && stored === null && returning
        ? migrateFromCards({ hidden, order }, makeWidgetId)
        : null,
    [hydrated, firstRunReady, stored, returning, hidden, order]
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
  const shown = useMemo(
    () => (widgets ? visibleWidgets(widgets, isPhone) : []),
    [widgets, isPhone]
  );
  const kinds = useMemo(() => distinctKinds(shown), [shown]);

  if (!hydrated) {
    return (
      <Centered>
        <Spinner label={t('common.loading')} />
      </Centered>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  if (layout === null && !firstRunReady) {
    return (
      <Centered>
        <Spinner label={t('common.loading')} />
      </Centered>
    );
  }
  if (layout === null) {
    return (
      <div className="mx-auto max-w-page space-y-4">
        <CharacterHeader characterId={activeCharacterId} overview />
        <OverviewSubNav />
        <DangerBanner />
        <WarBanner characterId={activeCharacterId} />
        <Suspense
          fallback={
            <Centered>
              <Spinner label={t('common.loading')} />
            </Centered>
          }
        >
          <RoleChooser firstRun onChoose={onLayoutChange} />
        </Suspense>
      </div>
    );
  }

  return (
    <OverviewRefreshProvider>
      <OverviewEditProvider layout={layout} onLayoutChange={onLayoutChange}>
        <WidgetDataProvider kinds={kinds} widgets={shown}>
          <Board characterId={activeCharacterId} layout={layout} />
        </WidgetDataProvider>
      </OverviewEditProvider>
    </OverviewRefreshProvider>
  );
}
