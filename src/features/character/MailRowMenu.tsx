import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useOpenAfterMenu } from '@/components/ui/useOpenAfterMenu';

interface MailRowMenuProps {
  /** The trigger's accessible name. */
  label: string;
  isRead: boolean;
  onSetRead: (read: boolean) => void;
  onDelete: () => void;
  /** `ghost` draws the hairline button the reader's Reply and Forward sit beside; a list row keeps the bare `plain` glyph. */
  variant?: 'plain' | 'ghost';
}

/** A row's ⋮ menu: Mark as unread / read, and Delete… (which asks first). */
export function MailRowMenu({
  label,
  isRead,
  onSetRead,
  onDelete,
  variant = 'plain',
}: MailRowMenuProps) {
  const { t } = useTranslation();
  // Delete opens a confirm: hold it until the menu has closed, so focus returns to this button.
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant={variant}
          size="row"
          icon={<Icon.More />}
          label={label}
          className={variant === 'plain' ? 'mr-1 shrink-0' : 'shrink-0'}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuItem onSelect={() => onSetRead(!isRead)}>
          {isRead ? t('mail.markAsUnread') : t('mail.markAsRead')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-danger" onSelect={() => run(onDelete)}>
          {t('mail.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
