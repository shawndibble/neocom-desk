/**
 * Right-click menu on a corp roster row (issue #421): Show Info opens the
 * shared Public Info Modal, on the `ContactContextMenu` precedent — the only
 * entry point into it, never a second click target on the row itself
 * (CONTEXT.md round 49). Always `'character'`: unlike Contacts, a roster row
 * has no faction case to disable.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { SetWaypointMenuItem } from '@/features/travel/SetWaypointMenuItem';
import { writeToClipboard } from '@/lib/clipboard';
import { usePublicInfoModal } from '@/stores/publicInfoModal';

export interface MemberContextMenuProps {
  characterId: number;
  name: string;
  /**
   * Where the member is (member tracking's `location_id`: a station,
   * structure or system, never an item), with the roster's name for it.
   * Omitted when the roster names no location — no "Set waypoint in game".
   */
  location?: { id: number; name: string };
  children: ReactElement;
}

export function MemberContextMenu({
  characterId,
  name,
  location,
  children,
}: MemberContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();

  return (
    <RowActionsMenu
      name={name}
      items={
        <>
          <MenuItem onSelect={() => void writeToClipboard(name)}>
            {t('corp.members.contextMenu.copyName')}
          </MenuItem>
          <MenuItem onSelect={() => open('character', characterId)}>
            {t('corp.members.contextMenu.showInfo')}
          </MenuItem>
          {location && <SetWaypointMenuItem locationId={location.id} placeName={location.name} />}
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
