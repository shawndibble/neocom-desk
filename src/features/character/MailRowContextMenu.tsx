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

export interface MailRowContextMenuProps {
  mailId: number;
  /** `undefined` for a header ESI returned with no sender — the item disables rather than vanishing. */
  senderId: number | undefined;
  children: ReactElement;
}

export function MailRowContextMenu({ mailId, senderId, children }: MailRowContextMenuProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={senderId === undefined}
          onSelect={() => {
            if (senderId !== undefined) open('character', senderId);
          }}
        >
          {t('mail.contextMenu.viewSender')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void writeToClipboard(String(mailId))}>
          {t('mail.contextMenu.copyMailId')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
