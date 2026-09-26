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
import { useContext, type ComponentProps, type ReactElement } from 'react';
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
