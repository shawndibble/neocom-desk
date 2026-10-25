/**
 * The demo's widget grid: the app's own `Widget` and `WidgetMenu`, drawn over
 * sample Views (`demoData.ts`) instead of the live feeds, in the same flex-wrap
 * rows as `WidgetGrid`. Loaded lazily by `OverviewDemo`, because the widget
 * stack is far too large for the landing page's first load.
 *
 * Everything is cosmetic. The edit context is a stand-in whose actions do
 * nothing (a menu choice just closes the menu), the titles are the real
 * link's look without a link, and a table's sort and pager are the only state
 * that moves, as they are local to the table in the app too.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OverviewEditContext, type OverviewEdit } from '@/features/overview/widgets/editContext';
import { flexRule, GRID_GAP } from '@/features/overview/widgets/gridStyle';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import { Widget } from '@/features/overview/widgets/Widget';
import { WidgetMenu } from '@/features/overview/widgets/WidgetMenu';
import { buildDemoViews, DEMO_WIDGETS } from './demoData';

const none = () => undefined;

/** How long the Mining survey's chart waits: its charting library is a chunk of its own. */
const SURVEY_CHART_DELAY_MS = 1200;

export default function DemoBoard() {
  const { t } = useTranslation();
  // Wall-clock read for the illustrative figures; lazy so it runs once.
  const [now] = useState(() => Date.now());
  const [widgets, setWidgets] = useState<readonly WidgetModel[]>(DEMO_WIDGETS);
  const [surveyChart, setSurveyChart] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSurveyChart(true), SURVEY_CHART_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const views = useMemo(() => {
    const built = buildDemoViews(t, now);
    if (surveyChart) return built;
    const survey = built.get('d-survey');
    return survey ? new Map(built).set('d-survey', { ...survey, chart: undefined }) : built;
  }, [t, now, surveyChart]);

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
      setRange: none,
      setRowsPerPage: (id, rowsPerPage) =>
        setWidgets((all) => all.map((w) => (w.id === id ? { ...w, rowsPerPage } : w))),
      setPlexPer30Days: none,
      setCalendarEvents: none,
      setRaidsWhere: none,
      setRaidsRadius: none,
      setTrendItems: none,
      setTrendHubs: none,
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
              onRemove={none}
              menu={<WidgetMenu widget={widget} inert />}
            />
          </div>
        ))}
      </div>
    </OverviewEditContext.Provider>
  );
}
