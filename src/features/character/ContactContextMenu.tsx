/**
 * Right-click menu on a Contacts row (issue #403): copy identifiers, and the
 * only entry point into the shared Public Info Modal — not a second click
 * target on the row itself (CONTEXT.md round 49).
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
import { usePublicInfoModal, type PublicInfoKind } from '@/stores/publicInfoModal';
import type { CharacterContact } from '@/esi/endpoints';

export interface ContactContextMenuProps {
  contact: CharacterContact;
  name: string;
  children: ReactElement;
}

/** No public faction-info endpoint is wired into the modal, so faction contacts get no Show Info. */
function publicInfoKind(contact: CharacterContact): PublicInfoKind | null {
  return contact.contact_type === 'faction' ? null : contact.contact_type;
}

export function ContactContextMenu({ contact, name, children }: ContactContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();
  const kind = publicInfoKind(contact);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void writeToClipboard(name)}>
          {t('contacts.contextMenu.copyName')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void writeToClipboard(String(contact.contact_id))}>
          {t('contacts.contextMenu.copyContactId')}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={kind === null}
          onSelect={() => {
            if (kind) open(kind, contact.contact_id);
          }}
        >
          {t('contacts.contextMenu.showInfo')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
