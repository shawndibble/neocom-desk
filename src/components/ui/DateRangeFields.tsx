import { cx } from '@/lib/cx';
import { TextInput } from './TextInput';
import { useFilterSurface } from './filterSurface';

interface DateRangeFieldsProps {
  from: string | null;
  to: string | null;
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
      <label data-filter-field={fromLabel} className={labelClassName}>
        {fromLabel}
        <TextInput
          type="date"
          className={fieldClassName}
          value={from ?? ''}
          onChange={(event) => onFromChange(event.target.value === '' ? null : event.target.value)}
        />
      </label>
      <label data-filter-field={toLabel} className={labelClassName}>
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
