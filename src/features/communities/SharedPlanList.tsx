import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, SearchInput } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';

/** One shared plan as a row: who shared it, and the dim line under its name. */
export interface SharedPlanRow {
  key: string;
  name: string;
  sharerName: string;
  /** The dim line: sharer, and the Community where more than one is listed, and the skill count. */
  detail: string;
  entries: PlanEntry[];
}

/**
 * Shared Skill plans with a search over plan or sharer and Copy to my plans on
 * each row. Used by the Community page's Skill plans tab (one Community) and
 * Skills › Plans' "From a Community plan" (every Community the pilot is in).
 * The caller owns loading and the empty state.
 */
export function SharedPlanList({
  rows,
  onCopy,
  listClassName = '',
}: {
  rows: readonly SharedPlanRow[];
  onCopy: (plan: { name: string; entries: PlanEntry[] }) => void;
  /** Extra classes on the list (a max height inside a dialog). */
  listClassName?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.name.toLowerCase().includes(needle) || row.sharerName.toLowerCase().includes(needle)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, needle]
  );

  return (
    <div className="min-w-0 space-y-2">
      <SearchInput
        className="w-full"
        value={query}
        placeholder={t('communities.plansDialog.search')}
        aria-label={t('communities.plansDialog.search')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length === 0 ? (
        <EmptyState title={t('communities.plansDialog.noMatch')} />
      ) : (
        <ul className={`divide-y divide-line ${listClassName}`}>
          {shown.map((row) => (
            <li key={row.key} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block truncate text-text-dim">{row.detail}</span>
              </span>
              <Button size="sm" onClick={() => onCopy({ name: row.name, entries: row.entries })}>
                {t('communities.plansDialog.copy')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
