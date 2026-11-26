import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Toast } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import { OverviewEditContext, type OverviewEdit } from './editContext';
import { makeWidgetId } from './ids';
import {
  addWidgetUndoable,
  duplicateWidgetUndoable,
  moveToWidget,
  moveWidget,
  newWidget,
  removeWidgetUndoable,
  renameWidget,
  resetLayoutUndoable,
  resizeWidgetUndoable,
  restoreLayout,
  setRange,
  setRowsPerPage,
  setPlexPer30Days,
  setCalendarEvents,
  setHiddenKinds,
  setRaidsRadius,
  setRaidsWhere,
  setProfitSource,
  setCampaignFaction,
  setTrendHubs,
  setHiddenLayers,
  setTrendItems,
  setScope,
  setAllScopesUndoable,
  setShow,
  setShowOnPhone,
  setView,
  snapshotLayout,
  stepWidget,
  type OverviewLayout,
  type UndoableResult,
  type WidgetShow,
} from './layout';
import { useWidgetBoard } from './board';
import { kindSumsAcrossCharacters } from './data/models';
import { visibleWidgets } from './visibility';

function sumsAsCreated(kind: string, show?: WidgetShow): boolean {
  const created = newWidget(kind, 'new', show);
  return created !== null && kindSumsAcrossCharacters(kind, created);
}

export const FLASH_MS = 1600;
const ROLES_UNDO_LABEL = 'overview.customize.undo.roles';

interface OverviewEditProviderProps {
  layout: OverviewLayout;
  onLayoutChange: (next: OverviewLayout) => void;
  children: ReactNode;
}

interface UndoToast {
  message: string;
  to: OverviewLayout;
  inCustomize: boolean;
}

export function OverviewEditProvider({
  layout,
  onLayoutChange,
  children,
}: OverviewEditProviderProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const board = useWidgetBoard();
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const snapshot = useRef<OverviewLayout | null>(null);
  const pendingFocus = useRef<{ id: string | null } | null>(null);

  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const isPhoneRef = useRef(isPhone);
  useEffect(() => {
    isPhoneRef.current = isPhone;
  }, [isPhone]);
  const boardRef = useRef(board);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const commit = useCallback(
    (next: OverviewLayout) => {
      if (next === layoutRef.current) return;
      layoutRef.current = next;
      onLayoutChange(next);
    },
    [onLayoutChange]
  );

  const commitUndoable = useCallback(
    (result: UndoableResult | null): boolean => {
      if (result === null) return false;
      commit(result.layout);
      setToast({ message: t(result.undoLabel), to: result.undoTo, inCustomize: editing });
      return true;
    },
    [commit, editing, t]
  );

  const flash = useCallback((id: string) => setFlashId(id), []);
  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null) return;
    pendingFocus.current = null;
    const selector =
      pending.id === null
        ? '[data-customize-bar] [data-focus-target]'
        : `[data-widget-id="${pending.id}"] [data-focus-target]`;
    const target = document.querySelector<HTMLElement>(selector);
    target?.focus();
  }, [layout]);

  const value = useMemo<OverviewEdit>(() => {
    const widgetIndex = (id: string) => layoutRef.current.widgets.findIndex((w) => w.id === id);
    const drawn = () =>
      visibleWidgets(layoutRef.current.widgets, isPhoneRef.current, boardRef.current.canDraw);

    const planFocusAfterRemoval = (id: string) => {
      const list = drawn();
      const at = list.findIndex((w) => w.id === id);
      const neighbour = at < 0 ? undefined : (list[at + 1] ?? list[at - 1]);
      pendingFocus.current = { id: neighbour?.id ?? null };
    };

    return {
      editing,
      layout,
      flashId,
      startEditing: () => {
        if (snapshot.current !== null) return;
        snapshot.current = snapshotLayout(layoutRef.current);
        setEditing(true);
      },
      done: () => {
        snapshot.current = null;
        setEditing(false);
        setToast((current) => (current?.inCustomize ? null : current));
      },
      cancel: () => {
        const before = snapshot.current;
        snapshot.current = null;
        setEditing(false);
        setToast(null);
        if (before !== null) commit(restoreLayout(before));
      },
      add: (kind, init) => {
        const opensOnAll =
          (boardRef.current.id === 'overview' || boardRef.current.opensOnAll.has(kind)) &&
          sumsAsCreated(kind, init?.show);
        const result = addWidgetUndoable(
          layoutRef.current,
          kind,
          makeWidgetId,
          opensOnAll ? { scope: 'all', ...init } : init
        );
        if (commitUndoable(result)) {
          const added = result?.layout.widgets.at(-1);
          if (added) flash(added.id);
        }
      },
      remove: (id) => {
        planFocusAfterRemoval(id);
        if (!commitUndoable(removeWidgetUndoable(layoutRef.current, id))) {
          pendingFocus.current = null;
        }
      },
      resize: (id, size) => void commitUndoable(resizeWidgetUndoable(layoutRef.current, id, size)),
      duplicate: (id) => {
        const result = duplicateWidgetUndoable(layoutRef.current, id, makeWidgetId);
        if (commitUndoable(result)) {
          const copy = result?.layout.widgets[widgetIndex(id) + 1];
          if (copy) flash(copy.id);
        }
      },
      reset: () =>
        void commitUndoable(
          resetLayoutUndoable(layoutRef.current, boardRef.current.defaultLayout(makeWidgetId))
        ),
      replace: (next) => {
        const before = layoutRef.current;
        commit(next);
        setToast({
          message: t(ROLES_UNDO_LABEL),
          to: snapshotLayout(before),
          inCustomize: editing,
        });
      },
      step: (id, direction) => {
        const shown = new Set(drawn().map((w) => w.id));
        commit(stepWidget(layoutRef.current, id, direction, (w) => shown.has(w.id)));
      },
      moveTo: (id, overId) => commit(moveToWidget(layoutRef.current, id, overId)),
      moveEdge: (id, edge) => commit(moveWidget(layoutRef.current, id, edge)),
      setView: (id, view) => commit(setView(layoutRef.current, id, view)),
      setScope: (id, scope) => commit(setScope(layoutRef.current, id, scope)),
      setAllScopes: (scope) =>
        void commitUndoable(
          setAllScopesUndoable(
            layoutRef.current,
            scope,
            (w) =>
              scope !== 'all' ||
              boardRef.current.id === 'corp' ||
              kindSumsAcrossCharacters(w.kind, w)
          )
        ),
      setRange: (id, range) => commit(setRange(layoutRef.current, id, range)),
      setRowsPerPage: (id, rows) => commit(setRowsPerPage(layoutRef.current, id, rows)),
      setPlexPer30Days: (id, plex) => commit(setPlexPer30Days(layoutRef.current, id, plex)),
      setCalendarEvents: (id, choice) => commit(setCalendarEvents(layoutRef.current, id, choice)),
      setHiddenKinds: (id, kinds) => commit(setHiddenKinds(layoutRef.current, id, kinds)),
      setRaidsWhere: (id, where) => commit(setRaidsWhere(layoutRef.current, id, where)),
      setRaidsRadius: (id, radius) => commit(setRaidsRadius(layoutRef.current, id, radius)),
      setProfitSource: (id, source) => commit(setProfitSource(layoutRef.current, id, source)),
      setCampaignFaction: (id, faction) =>
        commit(setCampaignFaction(layoutRef.current, id, faction)),
      setTrendItems: (id, items) => commit(setTrendItems(layoutRef.current, id, items)),
      setTrendHubs: (id, hubs) => commit(setTrendHubs(layoutRef.current, id, hubs)),
      setHiddenLayers: (id, layers) => commit(setHiddenLayers(layoutRef.current, id, layers)),
      setShow: (id, show) => commit(setShow(layoutRef.current, id, show)),
      rename: (id, title) => commit(renameWidget(layoutRef.current, id, title)),
      setShowOnPhone: (id, show) => commit(setShowOnPhone(layoutRef.current, id, show)),
    };
  }, [editing, layout, flashId, commit, commitUndoable, flash, t]);

  return (
    <OverviewEditContext.Provider value={value}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          instance={toast}
          undo={{
            label: t('overview.customize.undo.action'),
            onUndo: () => {
              commit(toast.to);
              setToast(null);
            },
          }}
          onClose={() => setToast(null)}
        />
      )}
    </OverviewEditContext.Provider>
  );
}
