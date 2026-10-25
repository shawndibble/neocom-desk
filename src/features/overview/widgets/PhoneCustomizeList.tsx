/**
 * Customize on a phone: the layout as a plain list to reorder and remove, every
 * target 44px. A phone's grid is two-across tiles, which drag and a per-tile
 * size control cannot work in, so sizes, views and ranges are left to a larger
 * screen (the note says so). Add widget, Reset, Cancel and Done are the edit
 * bar's, above this list.
 */
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { categoryOn, useWidgetBoard } from './board';
import { useOverviewEdit } from './editContext';
import { getKind, widgetKeys } from './kinds';

export function PhoneCustomizeList() {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const board = useWidgetBoard();
  const rows = edit.layout.widgets.filter((w) => {
    const kind = getKind(w.kind);
    return kind !== undefined && board.canDraw(kind);
  });
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1.5">
        {rows.map((widget, index) => {
          const kind = getKind(widget.kind);
          if (!kind) return null;
          const title = widget.title ?? t(widgetKeys(kind, widget.show).titleKey);
          const earlier = rows[index - 1];
          const later = rows[index + 1];
          return (
            <li
              key={widget.id}
              data-widget-id={widget.id}
              className="flex items-center gap-1 rounded-xs border border-line bg-panel py-1 pr-1 pl-3"
            >
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">{title}</b>
                <span className="block truncate text-xs text-text-dim">
                  {widget.showOnPhone
                    ? t(`overview.gallery.categories.${categoryOn(board, kind)}`)
                    : t('overview.customize.phone.hidden')}
                </span>
              </span>
              <IconButton
                size="row"
                icon={<Icon.Ascending />}
                label={t('overview.customize.phone.moveUp', { title })}
                disabled={!earlier}
                onClick={() => earlier && edit.moveTo(widget.id, earlier.id)}
              />
              <IconButton
                size="row"
                icon={<Icon.Descending />}
                label={t('overview.customize.phone.moveDown', { title })}
                disabled={!later}
                onClick={() => later && edit.moveTo(widget.id, later.id)}
              />
              <IconButton
                size="row"
                tone="danger"
                icon={<Icon.RemoveWidget />}
                label={t('overview.customize.phone.remove', { title })}
                onClick={() => edit.remove(widget.id)}
                data-focus-target
              />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-dim">{t('overview.customize.phone.note')}</p>
    </div>
  );
}
