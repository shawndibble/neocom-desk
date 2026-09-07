/**
 * A From/To date pair for a `FilterBar`, and the one filter control that keeps
 * its captions inline (issue #570).
 *
 * Extracted from Wallet's journal bar, which needed exactly this and now
 * shares it with the corp transactions bar beside it. Two reasons it is a
 * component rather than a fragment a caller inlines:
 *
 * - A date input reads as nothing without its caption, so these two want
 *   visible `<label>`s in the toolbar row as well as in the mobile sheet,
 *   where `FilterField`'s own caption is sheet-only.
 * - `useFilterSurface` is a hook, and `FilterBar` calls its `children` during
 *   its own render — so a bare fragment there would read the default surface
 *   rather than the sheet's.
 *
 * Inline, the wrapper is `display: contents`, so the two labels stay direct
 * items of the toolbar row and keep the widths they would have had on their
 * own. In the sheet it becomes a real row and the two fields split it, which
 * is what stops a range reading as two unrelated filters stacked apart.
 */
import { cx } from '@/lib/cx';
import { TextInput } from './TextInput';
import { useFilterSurface } from './filterSurface';

interface DateRangeFieldsProps {
  /** Inclusive `YYYY-MM-DD`, or `null` for "no lower bound". */
  from: string | null;
  to: string | null;
  /** `null` when the field is cleared, never `''`. */
  onFromChange: (value: string | null) => void;
  onToChange: (value: string | null) => void;
  fromLabel: string;
  toLabel: string;
}

export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
  fromLabel,
  toLabel,
}: DateRangeFieldsProps) {
  const sheet = useFilterSurface() === 'sheet';
  const labelClassName = cx(
    'flex items-center gap-1 text-xs text-text-dim',
    sheet && 'min-w-0 flex-1'
  );
  const fieldClassName = sheet ? 'w-full min-w-0' : 'w-36';
  return (
    <div className={sheet ? 'flex w-full items-center gap-2' : 'contents'}>
      <label className={labelClassName}>
        {fromLabel}
        <TextInput
          type="date"
          className={fieldClassName}
          value={from ?? ''}
          onChange={(event) => onFromChange(event.target.value === '' ? null : event.target.value)}
        />
      </label>
      <label className={labelClassName}>
        {toLabel}
        <TextInput
          type="date"
          className={fieldClassName}
          value={to ?? ''}
          onChange={(event) => onToChange(event.target.value === '' ? null : event.target.value)}
        />
      </label>
    </div>
  );
}
