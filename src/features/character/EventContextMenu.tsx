/**
 * Right-click menu for a Calendar event row (issue #416): copy its event id.
 *
 * It used to carry a second item, "Add to Month view", which jumped the Month
 * view to the event's date from Week or Agenda. The Split redesign put the
 * Calendar Map and the Coming Up Rail on screen at the same time, so there is
 * no longer another view to jump to — the item was removed rather than
 * repointed at something it never meant.
 */
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
  children: ReactElement;
}

export function EventContextMenu({ eventId, children }: EventContextMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(String(eventId))}>
          {t('calendar.contextMenu.copyEventId')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
