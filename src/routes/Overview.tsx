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
 * Scoped to the active Character; each widget's own menu may widen it to All
 * characters, honoured by the kinds whose reads can sum.
 */
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
import { useIsPhone } from '@/lib/useIsPhone';
import {
  OverviewCachedNotice,
  OverviewCustomize,
  OverviewDataAge,
  OverviewNext,
} from '@/features/overview/OverviewHeader';
import { useOverviewSummary } from '@/features/overview/useOverviewSummary';
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

/** Everything below the providers: the header, sub-nav and grid. */
function Board({ characterId, layout }: BoardProps) {
  const edit = useOverviewEdit();
  const { editing } = edit;
  const isPhone = useIsPhone();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const summary = useOverviewSummary(layout.widgets);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={characterId}
        overview
        actions={
          <>
            <OverviewNext summary={summary} />
            <OverviewCustomize />
          </>
        }
      />
      <OverviewSubNav trailing={<OverviewDataAge summary={summary} />} />
      <DangerBanner />
      <WarBanner characterId={characterId} />
      <OverviewCachedNotice summary={summary} />
      {editing && (
        <Suspense fallback={null}>
          <CustomizeBar onAdd={() => setGalleryOpen(true)} onRoles={() => setRolesOpen(true)} />
        </Suspense>
      )}
      {editing && isPhone && layout.widgets.length > 0 ? (
        <Suspense fallback={null}>
          <PhoneCustomizeList />
        </Suspense>
      ) : (
        <WidgetGrid
          widgets={layout.widgets}
          editing={editing}
          onRemove={edit.remove}
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
  // The old board's two settings: read for a returning pilot's first layout.
  // Only their read side is kept.
  const hidden = useOverviewHiddenCards((state) => state.value);
  const order = useOverviewCardOrder((state) => state.value);

  const storesHydrated = useHydratedStore(
    useOverviewLayout,
    useOverviewHiddenCards,
    useOverviewCardOrder
  );
  const hydrated = activeHydrated && storesHydrated;
  const returning = isReturningPilot(hidden, order);
  // An absent layout is a first run only once a second device's pull has had its say.
  const firstRunReady = useFirstRunReady(hydrated);

  // A returning pilot with no saved layout gets their old board, as widgets,
  // drawn at once and saved once.
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

  // No layout yet and not sure there is none: wait for the first pull rather than ask.
  if (layout === null && !firstRunReady) {
    return (
      <Centered>
        <Spinner label={t('common.loading')} />
      </Centered>
    );
  }
  if (layout === null) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
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
