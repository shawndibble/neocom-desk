import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import { usePortalContainer } from './portalContainer';
import * as Icon from './icons';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

/**
 * Listbox select, and the default one: every select in the app is this.
 * Wraps `radix-ui`'s Select — see docs/adr/0004 for why: focus movement,
 * typeahead, roving tabindex and screen-reader behaviour are exactly the parts
 * worth not hand-rolling.
 *
 * `NativeSelect` is the exception, for a caller that needs the OS picker
 * specifically; both draw from the same `controlStyles` tokens, so they differ
 * only once opened.
 *
 * Two things a real `<select>` gives free and this does not. The trigger is a
 * `<button>`, so a wrapping `<label>` — or `htmlFor` — will not name it; pass
 * `aria-label`. And its values are strings, so a numeric id needs `String()`
 * going in and `Number()` coming back out, or the trigger silently renders
 * empty.
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

interface SelectTriggerProps extends ComponentProps<typeof SelectPrimitive.Trigger> {
  /** `md` (default) is the page/form size; `sm` matches `Button size="sm"` inside a dense row. */
  size?: ControlSize;
}

export function SelectTrigger({ className, children, size = 'md', ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cx(
        fieldBaseClassName,
        fieldSizeClassName[size],
        'flex items-center justify-between gap-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[placeholder]:text-text-dim',
        // The trigger is a fixed-height control, so a label a few pixels wider
        // than the box must not wrap — two lines of text overflow the height
        // rather than growing it. Callers size these to their known options, but
        // the widest label is not always knowable (a character's group name, a
        // future translation), so the value ellipsizes instead. `min-w-0` is
        // what lets the value shrink at all: a flex child defaults to
        // `min-width: auto` and would otherwise refuse to go below its text.
        'overflow-hidden whitespace-nowrap [&>span]:min-w-0 [&>span]:truncate',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon.Expanded
          aria-hidden="true"
          size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
          className="shrink-0 text-text-dim"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  // Inside a `Modal` this is the dialog's own body; everywhere else it is null,
  // which Radix reads as "portal to document.body" — see `portalContainer.ts`.
  const container = usePortalContainer();
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cx(
          'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xs border border-line bg-panel text-text shadow-lg shadow-black/50',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cx(
        'relative flex cursor-pointer items-center rounded-xs py-1.5 pr-2 pl-7 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:text-text-dim data-[disabled]:opacity-50 data-[highlighted]:bg-panel-2 data-[highlighted]:text-text',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        className="absolute left-2 inline-flex items-center"
        aria-hidden="true"
      >
        ✓
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/**
 * A titled block of items — the Radix answer to `<optgroup>`. Wrap items in a
 * `SelectGroup` and give it one `SelectLabel`; the label is announced as the
 * group's name rather than read as another option.
 */
export const SelectGroup = SelectPrimitive.Group;

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      // Indented to `pl-7` like an item's text, so a group's title and its
      // members share one left edge — the item indent exists to clear the
      // check mark, and a label sitting outside it reads as ragged.
      className={cx(
        'px-2 pt-2 pb-1 pl-7 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase',
        className
      )}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cx('my-1 h-px bg-line', className)} {...props} />;
}
