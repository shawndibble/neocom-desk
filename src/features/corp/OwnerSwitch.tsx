/**
 * The Personal / Corporation switch (issue #298).
 *
 * Two `FilterChip`s in a labelled group rather than a second `Tabs` bar: Wallet
 * already owns a tablist, and a second one above it would read as competing
 * navigation instead of a change of owner for the table below.
 *
 * Labels arrive already translated, `FilterChip`'s own convention — the copy is
 * page-specific ("My jobs / Corp jobs" on Industry, "Personal / Corporation" on
 * Wallet), so it belongs to the page's own i18n namespace rather than a shared
 * corp one.
 *
 * Rendering this at all is the caller's decision: `useCorpOwner().available` is
 * false for a Character with no capability, and then nothing here is mounted.
 */
import { FilterChip } from '@/components/ui';
import type { DataOwner } from './owner';

interface OwnerSwitchProps {
  value: DataOwner;
  onChange: (owner: DataOwner) => void;
  /** Accessible name for the pair, already translated. */
  label: string;
  personalLabel: string;
  corporationLabel: string;
  className?: string;
}

export function OwnerSwitch({
  value,
  onChange,
  label,
  personalLabel,
  corporationLabel,
  className = '',
}: OwnerSwitchProps) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-1.5 ${className}`}>
      <FilterChip
        label={personalLabel}
        selected={value === 'personal'}
        onToggle={() => onChange('personal')}
      />
      <FilterChip
        label={corporationLabel}
        selected={value === 'corporation'}
        onToggle={() => onChange('corporation')}
      />
    </div>
  );
}
