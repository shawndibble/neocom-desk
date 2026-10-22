/**
 * The page header's ⋮ "More actions" menu: a `PageHeader` route's rare
 * actions (DESIGN.md §6c Header controls, tier 3), and, below a breakpoint,
 * the lower-priority actions that would otherwise wrap the header row.
 *
 * Children are `DropdownMenuItem`s (and separators). It renders nothing when
 * none of them is truthy, so a page can write
 * `<HeaderMoreMenu>{isPhone && <DropdownMenuItem…/>}</HeaderMoreMenu>` and the
 * ⋮ appears only when it holds something.
 *
 * Usage contract:
 * - Order: it is the last of the page's controls, after the page actions and
 *   Refresh and just before the `AlertsBell`: [scope picker] → text-labelled
 *   actions → icon-only actions (Refresh) → ⋮ → bell.
 * - A page decides in JS (`useIsPhone`, `useIsDesktop`, `useMediaQuery` in
 *   `src/lib`) whether an action renders inline or as an item here — never by
 *   rendering both and hiding one with CSS, which leaves two copies in the tab
 *   order and the accessibility tree.
 * - It needs two or more real actions (§6c restraint); one action keeps its
 *   own button at every width. Refresh never moves in: it stays a standalone
 *   icon beside the data age.
 * - It always draws at the header's touch tier (`IconButton`'s default: 44px
 *   square below `md`, 36px from `md` up), level with the icons beside it; it
 *   takes no size prop.
 *
 * @summary The page header's ⋮ "More actions" menu; renders nothing when it has no items.
 */
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './DropdownMenu';
import { IconButton } from './IconButton';
import * as Icon from './icons';

interface HeaderMoreMenuProps {
  /** @summary `DropdownMenuItem`s; falsy children are dropped, and with none left nothing renders. */
  children?: ReactNode;
}

/** Whether `node` holds anything that renders, looking through fragments. */
function hasItems(node: ReactNode): boolean {
  return Children.toArray(node).some((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? hasItems(child.props.children)
      : true
  );
}

export function HeaderMoreMenu({ children }: HeaderMoreMenuProps) {
  const { t } = useTranslation();
  if (!hasItems(children)) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<Icon.More />} label={t('common.moreActions')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
