/**
 * A row's actions, reachable two ways from one definition: the right-click
 * (or long-press) context menu, and a visible "More actions" button a
 * keyboard user can Tab to (WCAG 2.1.1).
 *
 * The items are written once, with the kind-agnostic `MenuItem`/`MenuSub*`
 * below, and rendered into both menus — each item reads which Radix family
 * it sits in from context, so the two can't drift. A row menu wrapper
 * (`RowActionsMenu`, or a hand-rolled one that provides `RowActionsContext`)
 * publishes its items; a `RowMoreActions` anywhere under it — a cell in the
 * row, or `DataTable`'s `rowMoreActions` column — draws the button.
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { MenuKindContext, RowActionsContext, type RowActions } from './rowActionsContext';
import { Tooltip } from './Tooltip';
import { TooltipHoldContext } from './tooltipHold';

export function MenuItem(props: ComponentProps<typeof ContextMenuItem>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuItem {...props} />
  ) : (
    <ContextMenuItem {...props} />
  );
}

/**
 * Below `md` a submenu opens in place, under its trigger, rather than as a
 * panel beside the menu: on a phone the parent menu already takes most of
 * the width, so a side panel had no room on either side — it squeezed to a
 * sliver or ran over its parent. Written as a `max-width` query so a
 * browser without media queries (jsdom) keeps the side panel.
 */
const NARROW_MENU_QUERY = '(max-width: 47.99rem)';

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(NARROW_MENU_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isNarrow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW_MENU_QUERY).matches
  );
}

/** An in-place submenu's state, from its `MenuSub` to its trigger and content. */
const InlineSubContext = createContext<{ open: boolean; toggle: () => void; id: string } | null>(
  null
);

export function MenuSub(props: ComponentProps<typeof ContextMenuSub>) {
  const kind = useContext(MenuKindContext);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = useCallback(() => setOpen((was) => !was), []);
  const inline = useMemo(() => ({ open, toggle, id }), [open, toggle, id]);
  if (narrow) {
    return <InlineSubContext.Provider value={inline}>{props.children}</InlineSubContext.Provider>;
  }
  // A side-panel submenu: nothing under it reads the in-place state.
  return (
    <InlineSubContext.Provider value={null}>
      {kind === 'dropdown' ? <DropdownMenuSub {...props} /> : <ContextMenuSub {...props} />}
    </InlineSubContext.Provider>
  );
}

export function MenuSubTrigger(props: ComponentProps<typeof ContextMenuSubTrigger>) {
  const kind = useContext(MenuKindContext);
  const inline = useContext(InlineSubContext);
  if (inline) {
    const { children, disabled, className } = props;
    return (
      <MenuItem
        disabled={disabled}
        aria-expanded={inline.open}
        aria-controls={inline.open ? inline.id : undefined}
        className={cx('justify-between', inline.open && 'bg-panel-2', className)}
        // Opens in place and keeps the menu up, rather than selecting.
        onSelect={(event) => {
          event.preventDefault();
          inline.toggle();
        }}
      >
        {children}
        <span
          aria-hidden="true"
          className={cx('text-text-dim transition-transform', inline.open && 'rotate-90')}
        >
          ›
        </span>
      </MenuItem>
    );
  }
  return kind === 'dropdown' ? (
    <DropdownMenuSubTrigger {...props} />
  ) : (
    <ContextMenuSubTrigger {...props} />
  );
}

export function MenuSubContent(props: ComponentProps<typeof ContextMenuSubContent>) {
  const kind = useContext(MenuKindContext);
  const inline = useContext(InlineSubContext);
  if (inline) {
    if (!inline.open) return null;
    return (
      // Its own items only: a submenu nested in it takes its own state.
      <InlineSubContext.Provider value={null}>
        <div
          id={inline.id}
          role="group"
          className={cx('ml-2 border-l border-line pl-1', props.className)}
        >
          {props.children}
        </div>
      </InlineSubContext.Provider>
    );
  }
  return kind === 'dropdown' ? (
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

export function MenuRadioItem(props: ComponentProps<typeof ContextMenuRadioItem>) {
  return useContext(MenuKindContext) === 'dropdown' ? (
    <DropdownMenuRadioItem {...props} />
  ) : (
    <ContextMenuRadioItem {...props} />
  );
}

/**
 * Right-click menu around `trigger`, publishing the same items for
 * `RowMoreActions`. Touch-and-hold anywhere in the row opens it, so the
 * tooltips of the controls inside give that gesture up (`tooltipHold.ts`) —
 * all but one that asks to keep it (`holdToReveal`, as `IskAmount` does).
 *
 * With `tooltip`, the trigger itself explains itself on hover and focus too
 * (a Fittings Ring tile); its touch-and-hold is the menu's alone, so what the
 * tooltip says must be reachable in the menu or elsewhere.
 */
export function RowActionsMenu({
  name,
  items,
  onOpenChange,
  tooltip,
  children,
}: RowActions & { tooltip?: string; children: ReactElement }) {
  const trigger = <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>;
  return (
    <RowActionsContext.Provider value={{ name, items, onOpenChange }}>
      <TooltipHoldContext.Provider value={false}>
        <ContextMenu onOpenChange={onOpenChange}>
          {tooltip === undefined ? (
            trigger
          ) : (
            // Around the menu's own trigger (a Radix primitive that merges
            // props), never inside it: a component there would drop them.
            <Tooltip content={tooltip}>{trigger}</Tooltip>
          )}
          <ContextMenuContent>{items}</ContextMenuContent>
        </ContextMenu>
      </TooltipHoldContext.Provider>
    </RowActionsContext.Provider>
  );
}

/**
 * The visible trigger for the enclosing row's actions. A real dropdown rather
 * than a synthetic right-click, so it announces `aria-haspopup`/`expanded`,
 * lands focus on the first item when opened from the keyboard, and hands
 * focus back to itself on close. `variant="plain"` drops the hairline border
 * so it doesn't compete with the row's own content. Renders nothing outside
 * a row that publishes actions.
 */
export function RowMoreActions({ className }: { className?: string }) {
  const { t } = useTranslation();
  const actions = useContext(RowActionsContext);
  if (!actions) return null;
  return (
    <DropdownMenu onOpenChange={actions.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
          label={t('common.moreActionsLabel', { name: actions.name })}
          variant="plain"
          size="row"
          className={className}
        />
      </DropdownMenuTrigger>
      {/* Stops a right-click on an item bubbling (through the React tree,
          portal or not) to the row's own context-menu trigger. */}
      <DropdownMenuContent align="end" onContextMenu={(event) => event.stopPropagation()}>
        <MenuKindContext.Provider value="dropdown">{actions.items}</MenuKindContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
