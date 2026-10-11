/**
 * The Overview's grid: flex-wrap rows of widgets in layout order.
 *
 * No gap-filling, on purpose: reading order is screen order is the order the
 * pilot arranged, so Move up and Move down do what they say. A row's leftover
 * width is shared by `flex-grow`, so there are no holes.
 */
import { useTranslation } from 'react-i18next';
import { useIsPhone } from '@/lib/useIsPhone';
import type { Widget as WidgetModel } from './layout';
import { flexRule, GRID_GAP, PHONE_GRID_GAP } from './gridStyle';
import { visibleWidgets } from './visibility';
import { Widget } from './Widget';

export interface WidgetGridProps {
  widgets: readonly WidgetModel[];
  showNew: boolean;
  headerAll: boolean;
  editing?: boolean;
  onOpenSettings?: (id: string) => void;
  onRemove: (id: string) => void;
}

export function WidgetGrid({
  widgets,
  showNew,
  headerAll,
  editing,
  onOpenSettings,
  onRemove,
}: WidgetGridProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const shown = visibleWidgets(widgets, isPhone);
  if (shown.length === 0) {
    return (
      <p className="rounded-xs border border-line bg-panel/85 px-3 py-4 text-xs text-text-dim">
        {t('overview.widgets.noWidgets')}
      </p>
    );
  }
  return (
    <div
      className="flex min-w-0 flex-wrap items-stretch"
      style={{ gap: isPhone ? PHONE_GRID_GAP : GRID_GAP }}
    >
      {shown.map((widget) => (
        <div key={widget.id} className="flex min-w-0" style={flexRule(widget.size, isPhone)}>
          <Widget
            widget={widget}
            showNew={showNew}
            headerAll={headerAll}
            editing={editing}
            onOpenSettings={onOpenSettings}
            onRemove={onRemove}
          />
        </div>
      ))}
    </div>
  );
}
