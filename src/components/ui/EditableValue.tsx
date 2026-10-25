import {
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

/** Keys that start an edit with themselves as its first character. */
const SEED_KEY = /^[0-9.,]$/;

/**
 * Faint pencil at rest, field box on hover or focus. The 36px touch tier is
 * the button's own height below `md` (§3), never an overhanging `::after`,
 * which reached into a row's next target.
 */
const editableValueClassName = cx(
  'inline-flex min-h-9 items-center gap-1 rounded-xs border border-transparent px-1 tabular-nums hover:border-line-bright hover:bg-panel-2 md:min-h-0',
  interactiveClassName,
  focusRingClassName
);

type EditableValueProps = Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'onClick' | 'onKeyDown' | 'type' | 'aria-label' | 'aria-labelledby'
> & {
  /** @summary The visible value, e.g. "3,000" or "@ 4 ISK". */
  children: ReactNode;
  /**
   * @summary The action, for a screen reader: "Edit Have for Tritanium". Read
   * before the value, so the button says what it does and what it holds.
   */
  label: string;
  /** @summary Opens the field; `seed` is the digit the pilot started typing on the value. */
  onEdit: (seed?: string) => void;
  /**
   * @summary Takes focus as it mounts — set when Enter or Escape has just
   * closed this value's field, so focus comes back to the pencil (§6c)
   * rather than falling to the page. `onFocused` clears the request.
   */
  focusOnMount?: boolean;
  /** @summary Called once the value has taken focus for `focusOnMount`, to clear the request. */
  onFocused?: () => void;
};

/**
 * @summary A number edited in place (DESIGN.md §6c, "Faint pencil after a
 * value"): the value as text with a faint pencil, a field box on hover or
 * focus, and the caller's field once clicked.
 *
 * The caller owns the field and swaps it in when `onEdit` fires. Typing a
 * digit while the value has focus opens the field with that digit, so
 * tabbing down a column and typing works the way it does when every cell is
 * a field. The field keeps `useInPlaceEdit`'s contract — Enter or blur saves,
 * Escape cancels, and Enter or Escape hands focus back here (`focusOnMount`,
 * or a `ref` the caller focuses). A click edits the value and never reaches a
 * row behind it.
 */
export function EditableValue({
  children,
  label,
  onEdit,
  className,
  focusOnMount = false,
  onFocused,
  ref,
  ...rest
}: EditableValueProps) {
  const ownRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    ownRef.current?.focus();
    onFocused?.();
  }, [focusOnMount, onFocused]);
  // Stable, so React doesn't detach and re-attach the caller's ref every render.
  const setRef = useCallback(
    (node: HTMLButtonElement | null) => {
      ownRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || !SEED_KEY.test(event.key)) return;
    event.preventDefault();
    onEdit(event.key);
  }
  return (
    <button
      {...rest}
      ref={setRef}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      onKeyDown={onKeyDown}
      className={cx(editableValueClassName, className)}
    >
      <span className="sr-only">{label}, </span>
      {children}
      <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-faint" />
    </button>
  );
}
