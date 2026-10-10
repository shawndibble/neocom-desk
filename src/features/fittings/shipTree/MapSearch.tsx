/**
 * The map's search, over every faction's hulls: "/" focuses it, Enter
 * picks the first hit, Escape clears. Picking a hull is the caller's —
 * another faction's switches the tree to it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveStatus, SearchInput } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { ShipTreeData, ShipTreeShip } from '@/sde/types';
import { FlyDot } from './FlyDot';
import { flyLabel } from './flyLabel';
import { searchHulls } from './shipTreeModel';

export function MapSearch({
  data,
  statuses,
  onPick,
}: {
  data: ShipTreeData;
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  onPick: (ship: ShipTreeShip) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchHulls(data.ships, query), [data, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function pick(ship: ShipTreeShip) {
    setQuery('');
    onPick(ship);
  }

  return (
    <div className="relative w-full sm:w-72">
      <SearchInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('ships.tree.searchPlaceholder')}
        aria-label={t('ships.tree.searchLabel')}
        aria-keyshortcuts="/"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            // The Ship Info window takes focus as it opens; without this the
            // same Enter would press whatever it focused (its close button).
            e.preventDefault();
            pick(results[0]);
          }
          if (e.key === 'Escape') setQuery('');
        }}
      />
      <LiveStatus>
        {query.trim() !== '' && t('ships.tree.searchCount', { count: results.length })}
      </LiveStatus>
      {results.length > 0 && (
        <ul
          aria-label={t('ships.tree.searchResults')}
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xs border border-line-bright bg-panel py-1 shadow-lg shadow-black/50"
        >
          {results.map((s) => {
            const status = statuses.get(s.typeID);
            return (
              <li key={s.typeID}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className={cx(
                    'flex w-full items-center gap-2 px-2 py-1 text-left text-sm',
                    rowInteractiveClassName,
                    focusRingInsetClassName
                  )}
                >
                  <FlyDot status={status} />
                  {status && <span className="sr-only">{flyLabel(t, status)}</span>}
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-text-dim">
                    {data.groups[String(s.treeGroupID)]?.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
