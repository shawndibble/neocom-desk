import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './DropdownMenu';
import { IconButton } from './IconButton';
import * as Icon from './icons';

interface HeaderMoreMenuProps {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
