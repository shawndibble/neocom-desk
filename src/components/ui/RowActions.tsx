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
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
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
import {
  MenuKindContext,
  RowActionsContext,
  RowMenuExtrasContext,
  type RowActions,
} from './rowActionsContext';
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
    if (child.type === MenuSeparator) continue;
    if (child.type === MenuItem || child.type === DisabledMenuItem) count += 1;
    else if (child.type === MenuSub) count += 2;
    else if (child.type === Fragment || child.type === MenuRadioGroup) {
      const inner = countMenuItems(child.props.children);
      if (inner === undefined) return undefined;
      count += inner;
    } else if (child.type === MenuRadioItem) count += 1;
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

/**
 * Right-click menu around `trigger`, publishing the same items for
 * `RowMoreActions`. Touch-and-hold anywhere in the row opens it, so the
 * tooltips of the controls inside give that gesture up (`tooltipHold.ts`):
 * a hold inside a row menu never reveals a tooltip.
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
  // Anything the surrounding table adds (DataTable's "Export table").
  // `RowMoreActions` appends the same itself, so the context value stays
  // the row's own items and a hand-rolled wrapper gets the extras too.
  const extras = useContext(RowMenuExtrasContext);
  useEffect(() => warnRestraint(name, items), [name, items]);
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
          <ContextMenuContent>
            {items}
            {extras}
          </ContextMenuContent>
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
 * a row that publishes actions. Only place one where §6c's restraint rules
 * allow a ⋮: at least two real actions reachable nowhere else, one trailing
 * control cluster at the row's right edge.
 */
export function RowMoreActions({ className }: { className?: string }) {
  const { t } = useTranslation();
  const actions = useContext(RowActionsContext);
  const extras = useContext(RowMenuExtrasContext);
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
        <MenuKindContext.Provider value="dropdown">
          {actions.items}
          {extras}
        </MenuKindContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
