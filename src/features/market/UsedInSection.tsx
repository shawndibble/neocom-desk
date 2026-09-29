/**
 * Item Detail's "Used in": every product whose blueprint or reaction formula
 * consumes this item, each row carrying the full item menu (Build Plan, View
 * in Market, Show info…). Reads the blueprint catalog on its own — the page's
 * Item Actions only load it on pages that offer Build Plan lazily — and fails
 * to nothing, like the modal's other nice-to-have sections.
 *
 * A mineral feeds thousands of blueprints, and every row is a full item menu,
 * so the list renders a capped slice with a filter and a "Show all".
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, TypeIcon } from '@/components/ui';
import {
  loadBlueprintCatalog,
  materialUsesFor,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { ItemContextMenu, ItemMoreActions } from './ItemContextMenu';
import { useOptionalItemActions } from './itemActions';

/** Rows shown before "Show all" — enough for anything but a mineral or common component. */
export const USED_IN_CAP = 50;

/** Only this many uses and the filter box would be more chrome than list. */
const FILTER_THRESHOLD = 10;

export function UsedInSection({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const actions = useOptionalItemActions();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(actions?.blueprints ?? null);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const hasActions = actions !== null;
  useEffect(() => {
    if (catalog || !hasActions) return;
    let cancelled = false;
    loadBlueprintCatalog()
      .then((loaded) => {
        if (!cancelled) setCatalog(loaded);
      })
      .catch(() => {
        // "Used in" is a bonus, not core item detail — a failed load renders nothing.
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, hasActions]);

  // Show info on a row swaps the open modal to that item without remounting it.
  const [shownFor, setShownFor] = useState(typeId);
  if (shownFor !== typeId) {
    setShownFor(typeId);
    setQuery('');
    setShowAll(false);
  }

  const uses = useMemo(() => (catalog ? materialUsesFor(catalog, typeId) : []), [catalog, typeId]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? uses.filter((use) => use.productName.toLowerCase().includes(q)) : uses;
  }, [uses, query]);

  // Every row is an item menu, which needs the page's Item Actions.
  if (!actions || uses.length === 0) return null;

  const visible = showAll ? filtered : filtered.slice(0, USED_IN_CAP);

  return (
    <section>
      <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.itemDetail.usedInTitle', { count: uses.length })}
      </h3>
      {uses.length > FILTER_THRESHOLD && (
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('market.itemDetail.usedInFilter')}
          aria-label={t('market.itemDetail.usedInFilter')}
          className="mt-2"
        />
      )}
      {filtered.length === 0 ? (
        <p className="mt-1 text-xs text-text-dim">{t('market.itemDetail.usedInNoMatch')}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {visible.map((use) => (
            <ItemContextMenu
              key={use.productTypeID}
              typeId={use.productTypeID}
              itemName={use.productName}
              // Every row here is buildable by definition; the page's own
              // lookup answers "No blueprint options" on pages that don't
              // load the catalog.
              blueprintTypeID={use.blueprintTypeID}
            >
              <li className="flex items-center justify-between gap-3 py-1 text-xs">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <TypeIcon
                    typeId={use.productTypeID}
                    size={32}
                    width={20}
                    height={20}
                    className="shrink-0"
                  />
                  <span className="truncate text-text">{use.productName}</span>
                  {use.activity === 'reaction' && (
                    <span className="shrink-0 text-text-dim">
                      {t('market.itemDetail.usedInReaction')}
                    </span>
                  )}
                </span>
                <span className="inline-flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-text-dim">
                    {t('market.itemDetail.usedInPerRun', {
                      quantity: use.quantity.toLocaleString(),
                    })}
                  </span>
                  <ItemMoreActions
                    typeId={use.productTypeID}
                    itemName={use.productName}
                    blueprintTypeID={use.blueprintTypeID}
                  />
                </span>
              </li>
            </ItemContextMenu>
          ))}
        </ul>
      )}
      {!showAll && filtered.length > USED_IN_CAP && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll(true)}>
          {t('market.itemDetail.usedInShowAll', { count: filtered.length })}
        </Button>
      )}
    </section>
  );
}
