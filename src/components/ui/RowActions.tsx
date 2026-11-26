import {
  Children,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useTouchContext } from '@/lib/useMediaQuery';
import { useCharacterCount } from '@/features/character/useCharacters';
import { hintSeenCount, recordHintSeen, useHintCounts, useOneTimeHint } from '@/lib/hintFlags';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './ContextMenu';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { Button } from './Button';
import { IconButton } from './IconButton';
import type { IconButtonSize, IconButtonVariant } from './iconButtonClassName';
import * as Icon from './icons';
import {
  MenuKindContext,
  RowActionsContext,
  RowOpenHrefContext,
  type RowActions,
} from './rowActionsContext';
import { Popover, PopoverAnchor, PopoverContent } from './Popover';
import { Tooltip } from './Tooltip';
import { TooltipHoldContext } from './tooltipHold';

export function MenuItem(props: ComponentProps<typeof ContextMenuItem>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuItem {...props} />
  ) : (
    <ContextMenuItem {...props} />
  );
}

export function OpenInNewTabMenuItem({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <MenuItem asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        {t('common.openInNewTab')}
      </a>
    </MenuItem>
  );
}

export function DisabledMenuItem({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip content={reason} openOnTap>
      <MenuItem
        aria-disabled
        onSelect={(event) => event.preventDefault()}
        className="aria-disabled:cursor-default aria-disabled:opacity-50"
      >
        {children}
      </MenuItem>
    </Tooltip>
  );
}

export function MenuSub(props: ComponentProps<typeof ContextMenuSub>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuSub {...props} />
  ) : (
    <ContextMenuSub {...props} />
  );
}

export function MenuSubTrigger(props: ComponentProps<typeof ContextMenuSubTrigger>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuSubTrigger {...props} />
  ) : (
    <ContextMenuSubTrigger {...props} />
  );
}

export function MenuSubContent(props: ComponentProps<typeof ContextMenuSubContent>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuSubContent {...props} />
  ) : (
    <ContextMenuSubContent {...props} />
  );
}

export function MenuSeparator(props: ComponentProps<typeof ContextMenuSeparator>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuSeparator {...props} />
  ) : (
    <ContextMenuSeparator {...props} />
  );
}

export function MenuRadioGroup(props: ComponentProps<typeof ContextMenuRadioGroup>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuRadioGroup {...props} />
  ) : (
    <ContextMenuRadioGroup {...props} />
  );
}

export function MenuLabel(props: ComponentProps<typeof ContextMenuLabel>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuLabel {...props} />
  ) : (
    <ContextMenuLabel {...props} />
  );
}

export function MenuCheckboxItem(props: ComponentProps<typeof ContextMenuCheckboxItem>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuCheckboxItem {...props} />
  ) : (
    <ContextMenuCheckboxItem {...props} />
  );
}

export function MenuRadioItem(props: ComponentProps<typeof ContextMenuRadioItem>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuRadioItem {...props} />
  ) : (
    <ContextMenuRadioItem {...props} />
  );
}

const MENU_GROUP_ORDER = ['primary', 'track', 'copy', 'game', 'other'] as const;
export type MenuGroupId = (typeof MENU_GROUP_ORDER)[number];

const FOLDED_GROUPS: Partial<Record<MenuGroupId, string>> = {
  track: 'common.menuGroup.track',
  game: 'common.menuGroup.game',
};

const MENU_FOLD_MIN = 3;

export function MenuGroup({
  children,
}: {
  id: MenuGroupId;
  children?: ReactNode;
  size?: number;
}): ReactNode {
  return children;
}

function flattenMenuNodes(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? flattenMenuNodes(child.props.children)
      : [child]
  );
}

const GROUP_CLASS =
  'empty:hidden [&:not(:empty)~&:not(:empty)]:mt-1 [&:not(:empty)~&:not(:empty)]:border-t [&:not(:empty)~&:not(:empty)]:border-line [&:not(:empty)~&:not(:empty)]:pt-1';

export function ArrangedMenuItems({ items }: { items: ReactNode }) {
  const { t } = useTranslation();
  const nodes = flattenMenuNodes(items);
  const isGroup = (
    node: ReactNode
  ): node is ReactElement<{ id: MenuGroupId; children?: ReactNode; size?: number }> =>
    isValidElement(node) && node.type === MenuGroup;
  if (!nodes.some(isGroup)) return <>{items}</>;
  const buckets = new Map<MenuGroupId, { content: ReactNode[]; size: number }>();
  const add = (id: MenuGroupId, content: ReactNode[], size = content.length) => {
    const bucket = buckets.get(id) ?? { content: [], size: 0 };
    buckets.set(id, { content: [...bucket.content, ...content], size: bucket.size + size });
  };
  for (const node of nodes) {
    if (isGroup(node)) {
      add(node.props.id, flattenMenuNodes(node.props.children), node.props.size);
    } else if (!(isValidElement(node) && node.type === MenuSeparator)) {
      add('other', [node]);
    }
  }
  return (
    <>
      {MENU_GROUP_ORDER.map((id) => {
        const bucket = buckets.get(id);
        if (!bucket?.content.length) return null;
        const { content, size } = bucket;
        const foldKey = FOLDED_GROUPS[id];
        return (
          <div key={id} role="group" className={GROUP_CLASS}>
            {foldKey !== undefined && size >= MENU_FOLD_MIN ? (
              <MenuSub>
                <MenuSubTrigger>{t(foldKey)}</MenuSubTrigger>
                <MenuSubContent>{content}</MenuSubContent>
              </MenuSub>
            ) : (
              content
            )}
          </div>
        );
      })}
    </>
  );
}

function countMenuItems(node: ReactNode): number | undefined {
  let count = 0;
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === MenuSeparator || child.type === MenuLabel) continue;
    if (child.type === MenuItem || child.type === DisabledMenuItem) count += 1;
    else if (child.type === MenuSub) count += 2;
    else if (child.type === Fragment || child.type === MenuRadioGroup || child.type === MenuGroup) {
      const inner = countMenuItems(child.props.children);
      if (inner === undefined) return undefined;
      count += inner;
    } else if (child.type === MenuRadioItem || child.type === MenuCheckboxItem) count += 1;
    else return undefined;
  }
  return count;
}

const warnedRestraint = new Set<string>();

function warnRestraint(name: string, items: ReactNode) {
  if (!import.meta.env.DEV || warnedRestraint.has(name)) return;
  const count = countMenuItems(items);
  if (count === undefined || count >= 2) return;
  warnedRestraint.add(name);
  console.warn(
    `RowActionsMenu "${name}": ${count === 0 ? 'no' : 'one'} real action. DESIGN.md §6c: a row menu needs at least two actions not reachable elsewhere; delete the menu (no ⋮, no right-click menu).`
  );
}

const BROWSER_MENU_TARGETS = 'a[href], input, textarea, select, [contenteditable="true"]';

function targetsBrowserMenu(event: SyntheticEvent): boolean {
  return event.target instanceof Element && event.target.closest(BROWSER_MENU_TARGETS) !== null;
}

const browserMenuGuard = {
  onContextMenuCapture(event: MouseEvent) {
    if (targetsBrowserMenu(event)) event.stopPropagation();
  },
  onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse' && targetsBrowserMenu(event)) {
      (event as { defaultPrevented: boolean }).defaultPrevented = true;
    }
  },
};

export function RowActionsMenu({
  name,
  items,
  onOpenChange,
  onCloseAutoFocus,
  modal,
  openHref,
  tooltip,
  linksKeepBrowserMenu = false,
  children,
}: RowActions & {
  tooltip?: string;
  openHref?: string;
  linksKeepBrowserMenu?: boolean;
  children: ReactElement;
}) {
  const trigger = (
    <ContextMenuTrigger asChild {...(linksKeepBrowserMenu ? browserMenuGuard : undefined)}>
      {children}
    </ContextMenuTrigger>
  );
  const rowHref = useContext(RowOpenHrefContext);
  const href = openHref ?? rowHref;
  useEffect(() => warnRestraint(name, items), [name, items]);
  return (
    <RowActionsContext.Provider
      value={{ name, items, onOpenChange, onCloseAutoFocus, modal, openHref: href }}
    >
      <TooltipHoldContext.Provider value={false}>
        <ContextMenu onOpenChange={onOpenChange} modal={modal}>
          {tooltip === undefined ? trigger : <Tooltip content={tooltip}>{trigger}</Tooltip>}
          <ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
            {href && <OpenInNewTabMenuItem href={href} />}
            <ArrangedMenuItems items={items} />
          </ContextMenuContent>
        </ContextMenu>
      </TooltipHoldContext.Provider>
    </RowActionsContext.Provider>
  );
}

const ROW_MENU_TIP = 'rowMenuTip';
const ROW_HINT = 'rowHint';
const ROW_MENU_TIP_OPENS = 3;

export function RowMoreActions({
  className,
  variant = 'plain',
  size = 'row',
  label,
  focusTarget = false,
  hints = true,
}: {
  className?: string;
  label?: string;
  focusTarget?: boolean;
  hints?: boolean;
  variant?: Extract<IconButtonVariant, 'ghost' | 'plain'>;
  size?: Extract<IconButtonSize, 'row' | 'sm'>;
}) {
  const { t } = useTranslation();
  const actions = useContext(RowActionsContext);
  const [tip, setTip] = useState(false);
  const loggedIn = useCharacterCount() > 0;
  const showTips = hints && loggedIn;
  const [hintShown, dismissHint] = useOneTimeHint(ROW_HINT, actions !== null && showTips);
  const context = useTouchContext();
  if (!actions) return null;
  const onOpenChange = (open: boolean) => {
    if (open) {
      if (hintShown) dismissHint();
      const { value, hydrated } = useHintCounts.getState();
      const earned =
        showTips && hydrated && hintSeenCount(value, ROW_MENU_TIP) < ROW_MENU_TIP_OPENS;
      setTip(earned);
      if (earned) recordHintSeen(ROW_MENU_TIP);
    }
    actions.onOpenChange?.(open);
  };
  return (
    <DropdownMenu onOpenChange={onOpenChange} modal={actions.modal}>
      <Popover open={hintShown} onOpenChange={(open) => !open && dismissHint()}>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
              label={label ?? t('common.moreActionsLabel', { name: actions.name })}
              variant={variant}
              size={size}
              className={className}
              data-focus-target={focusTarget ? true : undefined}
            />
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          aria-label={label ?? t('common.moreActionsLabel', { name: actions.name })}
          className="flex max-w-60 flex-col items-start gap-2 p-2 text-xs"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onFocusOutside={(event) => event.preventDefault()}
        >
          <p>{t('common.rowHint', { context })}</p>
          <Button size="sm" onClick={dismissHint}>
            {t('common.hintGotIt')}
          </Button>
        </PopoverContent>
      </Popover>
      <DropdownMenuContent
        align="end"
        onContextMenu={(event) => event.stopPropagation()}
        onCloseAutoFocus={actions.onCloseAutoFocus}
      >
        <MenuKindContext.Provider value="dropdown">
          {actions.openHref && <OpenInNewTabMenuItem href={actions.openHref} />}
          <ArrangedMenuItems items={actions.items} />
          {tip && (
            <p className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-xs text-text-dim">
              {t('common.rowMenuTip', { context })}
            </p>
          )}
        </MenuKindContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
