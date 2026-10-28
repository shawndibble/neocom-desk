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
  Children,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useId,
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
import {
  claimSessionHint,
  dismissSessionHint,
  hintSeenCount,
  recordHintSeen,
  releaseSessionHint,
  useHintCounts,
  useSessionHintShown,
} from '@/lib/hintFlags';
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
  RowMenuExtrasContext,
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

/**
 * "Open in new tab" for a row whose click goes to another page. A real link,
 * so the browser offers its own link menu on it too; same-origin, so no
 * `ExternalLink` mark. Row menus render it themselves from `openHref`.
 */
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

/**
 * A `MenuItem` that stays hoverable, focusable and tappable while inert,
 * explaining why via a tap-reachable `Tooltip` (issue #2162) — same
 * `aria-disabled`-over-native reasoning as `Characters.tsx`'s refresh-all
 * button, adapted for a Radix menu item: `menuItemClassName`'s
 * `data-[disabled]:pointer-events-none` keys off the native `disabled` prop,
 * so passing it here would swallow the very tap meant to reveal `reason`.
 * `onSelect` no-ops instead, keeping the menu open so the bubble stays
 * readable.
 */
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

/**
 * How many real actions `items` holds, or `undefined` when it can't tell (a
 * wrapper component may render any number). Separators and empties count 0; a
 * `MenuSub` counts as 2 (a submenu is a menu's worth of actions, so it never
 * trips the warning alone); a `MenuRadioGroup` counts its items.
 */
function countMenuItems(node: ReactNode): number | undefined {
  let count = 0;
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === MenuSeparator || child.type === MenuLabel) continue;
    if (child.type === MenuItem || child.type === DisabledMenuItem) count += 1;
    else if (child.type === MenuSub) count += 2;
    else if (child.type === Fragment || child.type === MenuRadioGroup) {
      const inner = countMenuItems(child.props.children);
      if (inner === undefined) return undefined;
      count += inner;
    } else if (child.type === MenuRadioItem || child.type === MenuCheckboxItem) count += 1;
    else return undefined;
  }
  return count;
}

const warnedRestraint = new Set<string>();

/**
 * Dev-only, once per row name: a `RowActionsMenu` over fewer than two real
 * actions is what DESIGN.md §6c's restraint rules retire.
 */
function warnRestraint(name: string, items: ReactNode) {
  if (!import.meta.env.DEV || warnedRestraint.has(name)) return;
  const count = countMenuItems(items);
  if (count === undefined || count >= 2) return;
  warnedRestraint.add(name);
  console.warn(
    `RowActionsMenu "${name}": ${count === 0 ? 'no' : 'one'} real action. DESIGN.md §6c: a row menu needs at least two actions not reachable elsewhere; delete the menu (no ⋮, no right-click menu).`
  );
}

/** Links and text fields: the browser's own menu (open in new tab, paste) is the one a pilot expects there. */
const BROWSER_MENU_TARGETS = 'a[href], input, textarea, select, [contenteditable="true"]';

function targetsBrowserMenu(event: SyntheticEvent): boolean {
  return event.target instanceof Element && event.target.closest(BROWSER_MENU_TARGETS) !== null;
}

/**
 * Right-click there stops before Radix's trigger (no `preventDefault`, so the browser menu shows).
 * A touch/pen press marks only React's event as prevented, in the trigger's own `onPointerDown`,
 * which Radix runs just before its long-press handler and skips that on a prevented event. The
 * native default (a tapped field taking focus, the browser's hold menu) still runs.
 */
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

/**
 * Right-click menu around `trigger`, publishing the same items for
 * `RowMoreActions`. Touch-and-hold anywhere in the row opens it (with
 * `linksKeepBrowserMenu`, anywhere but a link or field), so the tooltips of
 * the controls inside give that gesture up (`tooltipHold.ts`): a hold inside
 * a row menu never reveals a tooltip.
 *
 * With `tooltip`, the trigger itself explains itself on hover and focus too
 * (a Fittings Ring tile); its touch-and-hold is the menu's alone, so what the
 * tooltip says must be reachable in the menu or elsewhere.
 */
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
  /** A click on the row goes to this page: both menus lead with "Open in new tab". Never makes a row earn a menu alone (§6c). */
  openHref?: string;
  /** Right-click or hold on a link or text field stays the browser's (§6c "Entities", guardrail 2). */
  linksKeepBrowserMenu?: boolean;
  children: ReactElement;
}) {
  const trigger = (
    <ContextMenuTrigger asChild {...(linksKeepBrowserMenu ? browserMenuGuard : undefined)}>
      {children}
    </ContextMenuTrigger>
  );
  // Anything the surrounding table adds (DataTable's "Export table").
  // `RowMoreActions` appends the same itself, so the context value stays
  // the row's own items and a hand-rolled wrapper gets the extras too.
  const extras = useContext(RowMenuExtrasContext);
  const rowHref = useContext(RowOpenHrefContext);
  const href = openHref ?? rowHref;
  useEffect(() => warnRestraint(name, items), [name, items]);
  return (
    <RowActionsContext.Provider
      value={{ name, items, onOpenChange, onCloseAutoFocus, modal, openHref: href }}
    >
      <TooltipHoldContext.Provider value={false}>
        <ContextMenu onOpenChange={onOpenChange} modal={modal}>
          {tooltip === undefined ? (
            trigger
          ) : (
            // Around the menu's own trigger (a Radix primitive that merges
            // props), never inside it: a component there would drop them.
            <Tooltip content={tooltip}>{trigger}</Tooltip>
          )}
          <ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
            {href && <OpenInNewTabMenuItem href={href} />}
            {items}
            {extras}
          </ContextMenuContent>
        </ContextMenu>
      </TooltipHoldContext.Provider>
    </RowActionsContext.Provider>
  );
}

const ROW_MENU_TIP = 'rowMenuTip';
const ROW_HINT = 'rowHint';
/** How many ⋮ opens carry the "right-click any row" footer. */
const ROW_MENU_TIP_OPENS = 3;

/**
 * The one-time hint on the first ⋮ a pilot sees (§6c "Hints"): shows once ever,
 * on one ⋮ only, and never in a session that already showed another hint.
 */
function useRowMoreHint(active: boolean): [shown: boolean, dismiss: () => void] {
  const owner = `${ROW_HINT}:${useId()}`;
  const hydrated = useHintCounts((state) => state.hydrated);
  const shown = useSessionHintShown(owner);
  useEffect(() => {
    if (!active || !hydrated) return;
    if (hintSeenCount(useHintCounts.getState().value, ROW_HINT) > 0) return;
    if (claimSessionHint(owner)) return () => releaseSessionHint(owner);
  }, [active, hydrated, owner]);
  // Counted when answered, not when claimed: a hint that never reached the screen is not spent.
  const dismiss = () => {
    recordHintSeen(ROW_HINT);
    dismissSessionHint(owner);
  };
  return [shown, dismiss];
}

/**
 * The visible trigger for the enclosing row's actions. A real dropdown rather
 * than a synthetic right-click, so it announces `aria-haspopup`/`expanded`,
 * lands focus on the first item when opened from the keyboard, and hands
 * focus back to itself on close. `variant="plain"` drops the hairline border
 * so it doesn't compete with the row's own content. Renders nothing outside
 * a row that publishes actions. Only place one where §6c's restraint rules
 * allow a ⋮: at least two real actions reachable nowhere else, one trailing
 * control cluster at the row's right edge. Beside a `Button` in an action row
 * (the plan hero, next to Log production) pass `variant="ghost" size="sm"`:
 * a bordered button of the Button's own height.
 */
export function RowMoreActions({
  className,
  variant = 'plain',
  size = 'row',
  label,
  focusTarget = false,
}: {
  className?: string;
  /** The button's accessible name, when "More actions for {name}" is not the wording ("Settings for Wallet"). */
  label?: string;
  /** Marks the button as the place focus returns to (`data-focus-target`). */
  focusTarget?: boolean;
  /** `ghost` draws the hairline border, for a ⋮ that stands beside a `Button` rather than inside a row. */
  variant?: Extract<IconButtonVariant, 'ghost' | 'plain'>;
  /** `sm` matches `Button size="sm"`'s height. */
  size?: Extract<IconButtonSize, 'row' | 'sm'>;
}) {
  const { t } = useTranslation();
  const actions = useContext(RowActionsContext);
  const extras = useContext(RowMenuExtrasContext);
  const [tip, setTip] = useState(false);
  const [hintShown, dismissHint] = useRowMoreHint(actions !== null);
  const context = useTouchContext();
  if (!actions) return null;
  const onOpenChange = (open: boolean) => {
    if (open) {
      if (hintShown) dismissHint();
      // Counted per open, but the footer stays for the open that earned it.
      const { value, hydrated } = useHintCounts.getState();
      const earned = hydrated && hintSeenCount(value, ROW_MENU_TIP) < ROW_MENU_TIP_OPENS;
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
          className="flex max-w-60 flex-col items-start gap-2 p-2 text-xs"
          // A hint never takes focus from where the pilot is working.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Portalled, so React still bubbles these to the row's own handlers.
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          // Focus moving elsewhere is not an answer; a press outside or Escape is.
          onFocusOutside={(event) => event.preventDefault()}
        >
          <p>{t('common.rowHint', { context })}</p>
          <Button size="sm" onClick={dismissHint}>
            {t('common.hintGotIt')}
          </Button>
        </PopoverContent>
      </Popover>
      {/* Stops a right-click on an item bubbling (through the React tree,
          portal or not) to the row's own context-menu trigger. */}
      <DropdownMenuContent
        align="end"
        onContextMenu={(event) => event.stopPropagation()}
        onCloseAutoFocus={actions.onCloseAutoFocus}
      >
        <MenuKindContext.Provider value="dropdown">
          {actions.openHref && <OpenInNewTabMenuItem href={actions.openHref} />}
          {actions.items}
          {extras}
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
