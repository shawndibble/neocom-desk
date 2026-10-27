import { useEffect, useRef } from 'react';
import type { SelectionState } from '@/features/assets/assetSelection';
import { Checkbox } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

interface SelectionCheckboxProps {
  state: SelectionState;
  onToggle: () => void;
  label: string;
  /** Issue #738: the "All Characters" master row disables its browser column when the browser permission is blocked, the same as an individual row. */
  disabled?: boolean;
  /**
   * A visible word beside the box (a phone row's "Device"). Inside the label, so a click on it
   * toggles the box; `captionClassName` decides where it shows. Not part of the accessible name.
   */
  caption?: string;
  captionClassName?: string;
}

/** Tri-state checkbox for select mode (issue #90) — indeterminate can only be set imperatively, not via a JSX prop. */
export function SelectionCheckbox({
  state,
  onToggle,
  label,
  disabled = false,
  caption,
  captionClassName,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate';
  }, [state]);

  return (
    // The label is the 36px touch target on a coarse pointer (it grows its cell, never overlays a neighbour).
    <label
      className={
        caption === undefined
          ? touchCheckboxLabelClassName
          : cx('inline-flex min-h-9 cursor-pointer items-center gap-1.5', 'md:min-h-0')
      }
    >
      <Checkbox
        ref={ref}
        checked={state === 'checked'}
        disabled={disabled}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={label}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      {caption !== undefined && (
        <span aria-hidden="true" className={cx('text-xs text-text', captionClassName)}>
          {caption}
        </span>
      )}
    </label>
  );
}
