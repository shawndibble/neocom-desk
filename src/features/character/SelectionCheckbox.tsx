import { useEffect, useRef } from 'react';
import type { SelectionState } from './assetSelection';

interface SelectionCheckboxProps {
  state: SelectionState;
  onToggle: () => void;
  label: string;
  /** Issue #738: the "All Characters" master row disables its browser column when the browser permission is blocked, the same as an individual row. */
  disabled?: boolean;
}

/** Tri-state checkbox for select mode (issue #90) — indeterminate can only be set imperatively, not via a JSX prop. */
export function SelectionCheckbox({
  state,
  onToggle,
  label,
  disabled = false,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate';
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      disabled={disabled}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="size-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
