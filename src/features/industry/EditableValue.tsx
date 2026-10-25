import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { editPencilClassName, editableValueClassName } from './materialsTableStyle';

/** Keys that start an edit with themselves as its first character. */
const SEED_KEY = /^[0-9.,]$/;

interface EditableValueProps {
  /** The visible value, e.g. "3,000" or "@ 4 ISK". */
  children: ReactNode;
  /** Names the value for a screen reader ("Have: Tritanium"), read before it. */
  label: string;
  /** Opens the field; `seed` is the digit the pilot started typing on the value. */
  onEdit: (seed?: string) => void;
  className?: string;
  /**
   * Takes focus as it mounts — set when Enter or Escape has just closed this
   * value's field, so focus comes back to the pencil (§6c) rather than falling
   * to the page. `onFocused` clears the request.
   */
  focusOnMount?: boolean;
  onFocused?: () => void;
}

/**
 * A number edited in place (DESIGN.md §6c, "Faint pencil after a value"): the
 * value as text with a faint pencil, a field box on hover or focus, and the
 * field itself once clicked. Shared by the Materials table and its phone
 * cards so both widths use one cue. Typing a digit while it has focus opens
 * the field with that digit, so tabbing down a column and typing still works
 * the way it did when every cell was a field. The field (`SourcingInput` with
 * `onSettle`) keeps `useInPlaceEdit`'s contract: Enter or blur saves, Escape
 * cancels, and Enter or Escape hands focus back here.
 */
export function EditableValue({
  children,
  label,
  onEdit,
  className,
  focusOnMount = false,
  onFocused,
}: EditableValueProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    ref.current?.focus();
    onFocused?.();
  }, [focusOnMount, onFocused]);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || !SEED_KEY.test(event.key)) return;
    event.preventDefault();
    onEdit(event.key);
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onEdit()}
      onKeyDown={onKeyDown}
      className={cx(editableValueClassName, 'tabular-nums', className)}
    >
      <span className="sr-only">{label}: </span>
      {children}
      <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className={editPencilClassName} />
    </button>
  );
}
