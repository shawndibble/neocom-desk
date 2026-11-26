import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Spinner } from '@/components/ui';
import { guarded } from '@/app/routeChunks';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { corpDefaultLayout, corpWidgetBoard } from '@/features/corp/grid/corpGrid';
import {
  OverviewCachedNotice,
  OverviewCustomize,
  OverviewDataAge,
} from '@/features/overview/OverviewHeader';
import { useOverviewSummary } from '@/features/overview/useOverviewSummary';
import { readScope, WidgetBoardContext } from '@/features/overview/widgets/board';
import { CORP_DEFS } from '@/features/overview/widgets/data/corpModels';
import { registerKindDefs } from '@/features/overview/widgets/data/models';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { usePageScopeControl } from '@/features/overview/widgets/usePageScopeControl';
import { AccountCorporationsProvider } from '@/features/corp/AccountCorporationsProvider';
import { OverviewRefreshProvider } from '@/features/overview/widgets/data/OverviewRefreshProvider';
import { WidgetDataProvider } from '@/features/overview/widgets/data/WidgetDataProvider';
import { useOverviewEdit } from '@/features/overview/widgets/editContext';
import type { OverviewLayout } from '@/features/overview/widgets/layout';
import {
  CORP_OVERVIEW_LAYOUT_KEY,
  useCorpOverviewLayout,
} from '@/features/overview/widgets/layoutStore';
import { useFirstRunReady } from '@/features/overview/widgets/useFirstRunReady';
import { OverviewEditProvider } from '@/features/overview/widgets/OverviewEditProvider';
import { distinctKinds, visibleWidgets } from '@/features/overview/widgets/visibility';
import { WidgetGrid } from '@/features/overview/widgets/WidgetGrid';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { WarBanner } from '@/features/wars/WarBanner';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useIsPhone } from '@/lib/useIsPhone';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { corporationsReading, loadAccountCorpAccess } from '@/features/corp/corpReadAccess';
import { useActiveCharacter } from '@/stores/activeCharacter';

registerKindDefs(CORP_DEFS);

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

function CorpGrid({ layout }: { layout: OverviewLayout }) {
  const { t } = useTranslation();
  const { editing } = useOverviewEdit();
  const isPhone = useIsPhone();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const summary = useOverviewSummary(layout.widgets);
  const pageScope = usePageScopeControl();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);

  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title={t('nav.corpBoard')}
        meta={<OverviewDataAge summary={summary} note={t('corp.dataAgeNote')} />}
        scope={pageScope && <CharacterFilterControl {...pageScope} />}
        actions={<OverviewCustomize />}
      />
      {characterId !== null && <WarBanner characterId={characterId} />}
      <OverviewCachedNotice summary={summary} />
      {editing && (
        <Suspense fallback={<Spinner block="panel" label={t('common.loading')} />}>
          <CustomizeBar onAdd={() => setGalleryOpen(true)} />
        </Suspense>
      )}
      {editing && isPhone && layout.widgets.length > 0 ? (
        <Suspense fallback={<Spinner block="panel" label={t('common.loading')} />}>
          <PhoneCustomizeList />
        </Suspense>
      ) : (
        <WidgetGrid widgets={layout.widgets} editing={editing} onAdd={() => setGalleryOpen(true)} />
      )}
      <Suspense fallback={null}>
        {galleryOpen && <Gallery open onClose={() => setGalleryOpen(false)} />}
      </Suspense>
    </div>
  );
}

function CorpGridView({ capabilities }: { capabilities: CorpCapabilities }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const stored = useCorpOverviewLayout((state) => state.value);
  const setLayout = useCorpOverviewLayout((state) => state.setValue);
  const hydrated = useHydratedStore(useCorpOverviewLayout);
  const accounts = useAsyncLoad(loadAccountCorpAccess).data;
  const board = useMemo(
    () =>
      corpWidgetBoard(
        capabilities,
        accounts && ((wanted) => corporationsReading(accounts, wanted))
      ),
    [capabilities, accounts]
  );
  const fallback = useMemo(() => corpDefaultLayout(), []);

  const firstRunReady = useFirstRunReady(hydrated, CORP_OVERVIEW_LAYOUT_KEY);
  const [pending, setPending] = useState<OverviewLayout | null>(null);
  const canSave = stored !== null || firstRunReady;
  const canSaveRef = useRef(canSave);
  useEffect(() => {
    canSaveRef.current = canSave;
  }, [canSave]);
  useEffect(() => {
    if (pending !== null && canSave && stored === null) void setLayout(pending);
  }, [pending, canSave, stored, setLayout]);
  const onLayoutChange = useCallback(
    (next: OverviewLayout) => (canSaveRef.current ? void setLayout(next) : setPending(next)),
    [setLayout]
  );
  const layout = stored ?? pending ?? fallback;
  const shown = useMemo(
    () =>
      visibleWidgets(layout.widgets, isPhone, board.canDraw).map((widget) => ({
        ...widget,
        scope: readScope(board, widget),
      })),
    [layout.widgets, isPhone, board]
  );
  const kinds = useMemo(() => distinctKinds(shown), [shown]);

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }

  return (
    <WidgetBoardContext.Provider value={board}>
      <OverviewRefreshProvider>
        <OverviewEditProvider layout={layout} onLayoutChange={onLayoutChange}>
          <WidgetDataProvider kinds={kinds} widgets={shown}>
            <AccountCorporationsProvider>
              <CorpGrid layout={layout} />
            </AccountCorporationsProvider>
          </WidgetDataProvider>
        </OverviewEditProvider>
      </OverviewRefreshProvider>
    </WidgetBoardContext.Provider>
  );
}

export function Corp() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate();

  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader title={t('corp.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.noAccessTitle')}
          hint={t('corp.noAccessHint')}
          roleLine={t('corp.roleLine')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <CorpGridView capabilities={gate.capabilities} />
    ) : null;

  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
