import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@/components/ui';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { searchByProductName } from './blueprintCatalog';

const MAX_RESULTS = 20;

interface BlueprintPickerProps {
  catalog: BlueprintCatalog;
  onPick: (entry: BlueprintCatalogEntry) => void;
  className?: string;
}

/** Searchable blueprint picker: find a blueprint by its manufactured product's name. */
export function BlueprintPicker({ catalog, onPick, className = '' }: BlueprintPickerProps) {
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
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-panel-2"
              >
                <span className="truncate">{entry.productName}</span>
                <span className="shrink-0 text-text-faint">#{entry.blueprintTypeID}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
