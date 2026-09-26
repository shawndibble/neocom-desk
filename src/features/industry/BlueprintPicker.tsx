import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { searchByProductName } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';
import type { CharacterBlueprint } from '@/esi/endpoints';

const MAX_RESULTS = 20;

interface BlueprintPickerProps {
  catalog: BlueprintCatalog;
  onPick: (entry: BlueprintCatalogEntry) => void;
  /** Blueprints the pilot owns; a result with a copy among them carries an "Owned" tag. */
  ownedBlueprints?: readonly CharacterBlueprint[];
  className?: string;
}

/** Searchable blueprint picker: find a blueprint by its manufactured product's name. */
export function BlueprintPicker({
  catalog,
  onPick,
  ownedBlueprints = [],
  className = '',
}: BlueprintPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => searchByProductName(catalog, query).slice(0, MAX_RESULTS),
    [catalog, query]
  );

  return (
    <div className={className}>
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('industry.searchPlaceholder')}
        aria-label={t('industry.addPlan')}
      />
      {results.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
          {results.map((entry) => (
            <li key={entry.blueprintTypeID} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  onPick(entry);
                  setQuery('');
                }}
                className={`${tappableRowClassName} flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
              >
                <span className="truncate">{entry.productName}</span>
                {findOwnedBlueprint(ownedBlueprints, entry.blueprintTypeID) && (
                  <span className="shrink-0 rounded-xs border border-success/50 px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-widest text-success">
                    {t('industry.blueprintOwned')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
