/** Right-click menu for a Calendar event row (issue #416): copy its event id, and — from Week/Agenda only — jump Month view to its date. */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';

export interface EventContextMenuProps {
  eventId: number;
  eventDate: Date;
  /**
   * Switches to Month view anchored on this event's date. Omitted by Month
   * view itself — jumping to the view you're already in is a no-op action
   * with nothing to click through to.
   */
  onAddToMonthView?: (date: Date) => void;
  children: ReactElement;
}

export function EventContextMenu({
  eventId,
  eventDate,
  onAddToMonthView,
  children,
}: EventContextMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(String(eventId))}>
          {t('calendar.contextMenu.copyEventId')}
        </ContextMenuItem>
        {onAddToMonthView && (
          <ContextMenuItem onSelect={() => onAddToMonthView(eventDate)}>
            {t('calendar.contextMenu.addToMonthView')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
