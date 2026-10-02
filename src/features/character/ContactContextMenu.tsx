/**
 * Right-click menu on a Contacts row (issue #403): copy identifiers, and
 * Show Info. Clicking the row opens Show Info too (decision
 * `20261002-145207`); the menu entry stays for the
 * keyboard and for a reader who reaches for right-click first.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { usePublicInfoModal } from '@/stores/publicInfoModal';
import { contactPublicInfoKind, type ContactIdentity } from './contactsFilter';

export interface ContactContextMenuProps {
  contact: ContactIdentity;
  name: string;
  children: ReactElement;
}

export function ContactContextMenu({ contact, name, children }: ContactContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();
  const kind = contactPublicInfoKind(contact);

  return (
    <RowActionsMenu
      name={name}
      items={
        <>
          <MenuItem onSelect={() => void writeToClipboard(name)}>
            {t('contacts.contextMenu.copyName')}
          </MenuItem>
          <MenuItem onSelect={() => void writeToClipboard(String(contact.contact_id))}>
            {t('contacts.contextMenu.copyContactId')}
          </MenuItem>
          <MenuItem
            disabled={kind === null}
            onSelect={() => {
              if (kind) open(kind, contact.contact_id);
            }}
          >
            {t('contacts.contextMenu.showInfo')}
          </MenuItem>
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
