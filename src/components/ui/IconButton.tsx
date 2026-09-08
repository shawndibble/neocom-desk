import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import {
  iconButtonClassName,
  type IconButtonSize,
  type IconButtonTone,
  type IconButtonVariant,
} from './iconButtonClassName';

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** The glyph. Rendered `aria-hidden` — `label` is the accessible name. */
  icon: ReactNode;
  /**
   * The control's name, in plain language. Sets the `aria-label`, and the
   * tooltip text unless `tooltip` overrides it — never a description, always
   * what the button does.
   */
  label: string;
  /**
   * Shortens the visible bubble only: a per-item action keeps the item in
   * `label` ("Delete Rifter run") for a screen reader, while a pointer user
   * looking at the row needs "Delete". Keep text here a substring of `label`
   * (WCAG 2.5.3 Label in Name) — which does not bind an icon-only control
   * like this one, so a bubble that explains rather than names (the materials
   * table's make-or-buy verdict) may be a node instead. Defaults to `label`.
   */
  tooltip?: ReactNode;
  onClick?: () => void;
  /** Present makes this a toggle: renders `aria-pressed` and takes the accent treatment when on. */
  pressed?: boolean;
  disabled?: boolean;
  /**
   * `ghost` (default) carries the hairline border of a Button. `plain` drops
   * it, for affordances that sit inside a row and would otherwise draw a box
   * around every line of a list.
   */
  variant?: IconButtonVariant;
  /**
   * `danger` is the destructive treatment, matching `Button variant="danger"`.
   * `positive` is the "worth doing" treatment (`text-isk-pos`, the app's
   * savings-green) — a make-or-buy call worth acting on, say. Either lives
   * here rather than as a caller `className` because the base classes
   * already set a text colour: two colour utilities on one element resolve by
   * stylesheet order, not by the order they appear in the attribute, so an
   * override passed in from outside is not reliably an override.
   */
  tone?: IconButtonTone;
  /** `md` (default) is the toolbar size; `sm` is for controls nested inside a dense row. */
  size?: IconButtonSize;
  className?: string;
}

/**
 * An icon-only control with a real accessible name.
 *
 * Icon-only buttons fail two ways and this component is what stops both: no
 * accessible name (so a screen reader announces "button"), and a hit target
 * sized for a mouse. The name is mandatory — `label` is not optional and is
 * used for `aria-label` and the Tooltip alike, so the two can never drift
 * unless a caller deliberately shortens the bubble via `tooltip`.
 * The default size is the 44px touch tier below `md` and the standard 36px
 * control above it (DESIGN.md §3); a pointer never gets the phone-sized box
 * and a thumb never gets the mouse-sized one.
 *
 * It forwards its ref and spreads unknown props onto the `<button>`, so it can
 * be a Radix trigger directly — `<DropdownMenuTrigger asChild><IconButton …/>`
 * works, and the `aria-expanded`/`data-state` Radix clones onto it land on the
 * real button rather than being dropped.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    tooltip,
    onClick,
    pressed,
    disabled = false,
    variant = 'ghost',
    tone = 'default',
    size = 'md',
    className = '',
    ...rest
  },
  ref
) {
  return (
    <Tooltip content={tooltip ?? label}>
      <button
        {...rest}
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={iconButtonClassName({ variant, tone, size, pressed, disabled, className })}
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          {icon}
        </span>
      </button>
    </Tooltip>
  );
});
