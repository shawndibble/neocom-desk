/** @summary The page header's ⋮ "More actions" menu; renders nothing when it has no items. */
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './DropdownMenu';
import { IconButton } from './IconButton';
import * as Icon from './icons';

interface HeaderMoreMenuProps {
  /** @summary `DropdownMenuItem`s; non-element children (`false`, `0`, strings) are dropped, and with none left nothing renders. */
  children?: ReactNode;
  /** @summary Controlled open state, for a menu whose item must keep it open (a clipboard write) or open a dialog after it closes; omit for an uncontrolled menu. */
  open?: boolean;
  /** @summary Called when the menu opens or closes; pass with `open`. */
  onOpenChange?: (open: boolean) => void;
  /** @summary Runs once the menu has handed focus back to ⋮: the moment to open a dialog an item chose. */
  onCloseAutoFocus?: () => void;
}

function hasItems(node: ReactNode): boolean {
  return Children.toArray(node).some(
    (child) =>
      isValidElement<{ children?: ReactNode }>(child) &&
      (child.type !== Fragment || hasItems(child.props.children))
  );
}

export function HeaderMoreMenu({
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: HeaderMoreMenuProps) {
  const { t } = useTranslation();
  if (!hasItems(children)) return null;
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<Icon.More />} label={t('common.moreActions')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
