/**
 * Right-click menu on an Employment History row (issue #729): the only entry
 * point into the shared Public Info Modal for a past employer, on the
 * `ContactContextMenu`/`MemberContextMenu` precedent — never a second click
 * target on the row itself (CONTEXT.md round 49). Always `'corporation'`.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { usePublicInfoModal } from '@/stores/publicInfoModal';

export interface CorpHistoryContextMenuProps {
  corporationId: number;
  name: string;
  children: ReactElement;
}

export function CorpHistoryContextMenu({
  corporationId,
  name,
  children,
}: CorpHistoryContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();

  return (
    <RowActionsMenu
      name={name}
      items={
        <>
          <MenuItem onSelect={() => void writeToClipboard(name)}>
            {t('employmentHistory.contextMenu.copyName')}
          </MenuItem>
          <MenuItem onSelect={() => open('corporation', corporationId)}>
            {t('employmentHistory.contextMenu.showInfo')}
          </MenuItem>
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
