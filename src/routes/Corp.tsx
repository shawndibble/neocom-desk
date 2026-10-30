/**
 * `/corp` — the Corp Board: a grid of corp widgets the pilot chooses,
 * sizes, orders, renames and removes, like the Overview (`routes/Overview.tsx`).
 *
 * A corp manager does not browse, they triage, and the default layout says so:
 * Due soon and the structure and moon clocks lead, money and people follow.
 * Everything after that is the pilot's choice (`features/corp/grid`).
 *
 * Three rules shape it:
 *
 * - **Each widget is gated on its own capability.** A Station Manager who is
 *   not an Accountant gets clocks and no wallet widgets, with no error and no
 *   empty-state noise. The gate is `useCorpRouteGate()`'s resolved
 *   `capabilities`, never a role string, and it decides what is offered and
 *   drawn; each read is gated again in its loader before it fetches, since an
 *   ungated read buys a guaranteed 403.
 * - **`unknown` renders neutrally here, and nothing in the nav.** A nav item
 *   that flickers into existence is worse than one a beat late (GLOSSARY.md
 *   round 35), but bouncing a Director who deep-linked before their roles read
 *   landed is simply a bug.
 * - **Hour-stale data is stated, not hidden.** CCP caches these endpoints for
 *   about an hour. The data-age popover says so, and no widget prints a
 *   countdown shorter than that window.
 */
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
import { WidgetBoardContext } from '@/features/overview/widgets/board';
import { CORP_DEFS } from '@/features/overview/widgets/data/corpModels';
import { registerKindDefs } from '@/features/overview/widgets/data/models';
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
import { useActiveCharacter } from '@/stores/activeCharacter';

// The corp kinds' builders load with this route, not with the Overview's startup graph.
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

/** The header, edit bar and grid, below the providers. */
function CorpGrid({ layout }: { layout: OverviewLayout }) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const { editing } = edit;
  const isPhone = useIsPhone();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const summary = useOverviewSummary(layout.widgets);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/*
        Title, tabs, data age and Customize on one line. No Next deadline
        button: it squeezed the five tabs off the line, and Due soon already
        names the next clock.
      */}
      <PageHeader
        title={t('nav.corpBoard')}
        meta={<OverviewDataAge summary={summary} note={t('corp.dataAgeNote')} />}
        actions={<OverviewCustomize />}
      />
      {characterId !== null && <WarBanner characterId={characterId} />}
      <OverviewCachedNotice summary={summary} />
      {editing && (
        <Suspense fallback={null}>
          <CustomizeBar onAdd={() => setGalleryOpen(true)} />
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
        />
      )}
      <Suspense fallback={null}>
        {galleryOpen && <Gallery open onClose={() => setGalleryOpen(false)} />}
      </Suspense>
    </div>
  );
}

/**
 * The grid, mounted only once Corp Access has resolved to `ready`.
 *
 * That split is load-bearing. On a cold load `useCorpAccess` reports `unknown`
 * with no capabilities for the first frames; a board built then would offer and
 * draw nothing. Mounting on `ready` means the first render already has the
 * real capability set, and a character switch returns to `unknown` while the
 * new character's roles read is in flight, so this unmounts and comes back
 * with that character's answer.
 */
function CorpGridView({ capabilities }: { capabilities: CorpCapabilities }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const stored = useCorpOverviewLayout((state) => state.value);
  const setLayout = useCorpOverviewLayout((state) => state.setValue);
  const hydrated = useHydratedStore(useCorpOverviewLayout);
  const board = useMemo(() => corpWidgetBoard(capabilities), [capabilities]);
  const fallback = useMemo(() => corpDefaultLayout(), []);

  // The default draws at once, but a first edit over it is only saved once this device's first
  // pull has had its say: written earlier, it would overwrite the layout another device synced.
  // Until then it is held here; if a synced layout lands meanwhile, that one wins.
  const firstRunReady = useFirstRunReady(hydrated, CORP_OVERVIEW_LAYOUT_KEY);
  const [pending, setPending] = useState<OverviewLayout | null>(null);
  const canSave = stored !== null || firstRunReady;
  const canSaveRef = useRef(canSave);
  useEffect(() => {
    canSaveRef.current = canSave;
  }, [canSave]);
  // Once stored, `stored` wins over `pending`, so `pending` never needs clearing.
  useEffect(() => {
    if (pending !== null && canSave && stored === null) void setLayout(pending);
  }, [pending, canSave, stored, setLayout]);
  const onLayoutChange = useCallback(
    (next: OverviewLayout) => (canSaveRef.current ? void setLayout(next) : setPending(next)),
    [setLayout]
  );
  const layout = stored ?? pending ?? fallback;
  const kinds = useMemo(
    () => distinctKinds(visibleWidgets(layout.widgets, isPhone, board.canDraw)),
    [layout.widgets, isPhone, board]
  );

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }

  return (
    <WidgetBoardContext.Provider value={board}>
      <OverviewRefreshProvider>
        <OverviewEditProvider layout={layout} onLayoutChange={onLayoutChange}>
          <WidgetDataProvider kinds={kinds}>
            <CorpGrid layout={layout} />
          </WidgetDataProvider>
        </OverviewEditProvider>
      </OverviewRefreshProvider>
    </WidgetBoardContext.Provider>
  );
}

export function Corp() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate();

  // `CorpRolesGate` holds the page while the roles resolve. This is the one
  // place corp UI treats `unknown` as its own state rather than as `none`: the
  // nav hides so it cannot flicker, but bouncing a Director who deep-linked
  // before their roles read landed would simply be a bug. See `useCorpRouteGate`.
  //
  // Denied: reached the URL without the access for it. A bare explanation, not
  // the section's shell drawn over nothing — that would be a lock, and corp UI
  // hides rather than locks (GLOSSARY.md round 35). The copy says roles only
  // change in game; a Character that holds a role but lacks the grant can fix
  // that from Settings' Corporation Permission row.
  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title={t('corp.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.noAccessTitle')}
          hint={t('corp.noAccessHint')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <CorpGridView capabilities={gate.capabilities} />
    ) : null;

  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
