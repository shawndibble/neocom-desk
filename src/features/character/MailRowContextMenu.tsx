/**
 * Right-click menu on a Mail list row (issue #889): the identity-carrying rows
 * everywhere else in the app carry one, and this was the last that did not.
 *
 * The sender comes in as the header's own `from` id, never as the text the row
 * renders: on the Sent tab that text is the *recipient* summary, so deriving
 * the identity from what is on screen would open the wrong character there.
 * Like `IssuerLink` — the reading pane's entry point into the same modal — a
 * mail sender is always addressed as a character, so there is no `kind`
 * branching (CONTEXT.md round 49).
 *
 * A `RowActionsMenu`, so the row's visible More-actions twin (issue #2060) �
 * a `RowMoreActions` beside the row button, not inside it � opens the same items.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { usePublicInfoModal } from '@/stores/publicInfoModal';

export interface MailRowContextMenuProps {
  mailId: number;
  /** Names the row for the More-actions button's accessible label. */
  subject: string;
  /** `undefined` for a header ESI returned with no sender — the item disables rather than vanishing. */
  senderId: number | undefined;
  children: ReactElement;
}

export function MailRowContextMenu({
  mailId,
  subject,
  senderId,
  children,
}: MailRowContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();

  const items = [
    <MenuItem
      key="viewSender"
      disabled={senderId === undefined}
      onSelect={() => {
        if (senderId !== undefined) open('character', senderId);
      }}
    >
      {t('mail.contextMenu.viewSender')}
    </MenuItem>,
    <MenuItem key="copyMailId" onSelect={() => void writeToClipboard(String(mailId))}>
      {t('mail.contextMenu.copyMailId')}
    </MenuItem>,
  ];

  return (
    <RowActionsMenu name={subject} items={items}>
      {children}
    </RowActionsMenu>
  );
}
