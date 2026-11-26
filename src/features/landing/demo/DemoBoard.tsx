import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OverviewEditContext, type OverviewEdit } from '@/features/overview/widgets/editContext';
import { flexRule, GRID_GAP } from '@/features/overview/widgets/gridStyle';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import { Widget } from '@/features/overview/widgets/Widget';
import { WidgetMenu } from '@/features/overview/widgets/WidgetMenu';
import { buildDemoViews, DEMO_WIDGETS } from './demoData';

const none = () => undefined;

export default function DemoBoard() {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  const [widgets, setWidgets] = useState<readonly WidgetModel[]>(DEMO_WIDGETS);
  const views = useMemo(() => buildDemoViews(t, now), [t, now]);

  const edit = useMemo<OverviewEdit>(
    () => ({
      editing: false,
      startEditing: none,
      done: none,
      cancel: none,
      layout: { version: 1, widgets: [...widgets] },
      flashId: null,
      add: none,
      remove: none,
      resize: none,
      duplicate: none,
      reset: none,
      replace: none,
      step: none,
      moveTo: none,
      moveEdge: none,
      setView: none,
      setScope: none,
      setAllScopes: none,
      setRange: none,
      setRowsPerPage: (id, rowsPerPage) =>
        setWidgets((all) => all.map((w) => (w.id === id ? { ...w, rowsPerPage } : w))),
      setPlexPer30Days: none,
      setCalendarEvents: none,
      setHiddenKinds: none,
      setRaidsWhere: none,
      setRaidsRadius: none,
      setProfitSource: none,
      setCampaignFaction: none,
      setTrendItems: none,
      setTrendHubs: none,
      setHiddenLayers: none,
      setShow: none,
      rename: none,
      setShowOnPhone: none,
    }),
    [widgets]
  );

  return (
    <OverviewEditContext.Provider value={edit}>
      <div className="flex min-w-0 flex-wrap items-stretch" style={{ gap: GRID_GAP }}>
        {widgets.map((widget) => (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            className="flex min-w-0"
            style={flexRule(widget.size, false)}
          >
            <Widget
              widget={widget}
              previewView={views.get(widget.id)}
              inertTitle
              menu={(card) => (
                <WidgetMenu widget={widget} inert>
                  {card}
                </WidgetMenu>
              )}
            />
          </div>
        ))}
      </div>
    </OverviewEditContext.Provider>
  );
}
