/**
 * Right-click menu on a corp roster row (issue #421): Show Info opens the
 * shared Public Info Modal, on the `ContactContextMenu` precedent — the only
 * entry point into it, never a second click target on the row itself
 * (CONTEXT.md round 49). Always `'character'`: unlike Contacts, a roster row
 * has no faction case to disable.
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
import { usePublicInfoModal } from '@/stores/publicInfoModal';

export interface MemberContextMenuProps {
  characterId: number;
  name: string;
  children: ReactElement;
}

export function MemberContextMenu({ characterId, name, children }: MemberContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(name)}>
          {t('corp.members.contextMenu.copyName')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => open('character', characterId)}>
          {t('corp.members.contextMenu.showInfo')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
