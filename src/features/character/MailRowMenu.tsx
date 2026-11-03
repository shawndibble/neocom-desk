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
}

/** A row's ⋮ menu: Mark as unread / read, and Delete… (which asks first). */
export function MailRowMenu({ label, isRead, onSetRead, onDelete }: MailRowMenuProps) {
  const { t } = useTranslation();
  // Delete opens a confirm: hold it until the menu has closed, so focus returns to this button.
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="plain"
          size="row"
          icon={<Icon.More />}
          label={label}
          className="mr-1 shrink-0"
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
