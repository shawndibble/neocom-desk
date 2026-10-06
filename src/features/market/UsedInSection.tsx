/**
 * Item Detail's "Used in": every product whose blueprint or reaction formula
 * consumes this item, each row carrying the full item menu (Build Plan, View
 * in Market, Show info…). Reads the blueprint catalog on its own — the page's
 * Item Actions only load it on pages that offer Build Plan lazily — and fails
 * to nothing, like the modal's other nice-to-have sections.
 *
 * A mineral feeds thousands of blueprints, and every row is a full item menu,
 * so the list renders a page at a time — "Show more" adds another — with a
 * filter to reach anything further down. The row's "More actions" button
 * opens the menu `ItemContextMenu` publishes rather than building its own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button, RowMoreActions, SearchInput, TypeIcon } from '@/components/ui';
import {
  loadBlueprintCatalog,
  materialUsesFor,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { ItemContextMenu } from './ItemContextMenu';
import { ItemInfoLink } from '@/features/entities';
import { useOptionalItemActions } from './itemActions';

/** Rows per page — the whole list for anything but a mineral or common component. */
export const USED_IN_PAGE = 50;

/** Only this many uses and the filter box would be more chrome than list. */
const FILTER_THRESHOLD = 10;

export function UsedInSection({
  typeId,
  onNavigate,
}: {
  typeId: number;
  /**
   * Closes the modal once a row's menu navigates (Build Plan, View in
   * Market…). Market and Industry keep their page mounted across tabs, so
   * otherwise the modal would stay open over the page it just sent you to.
   */
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const actions = useOptionalItemActions();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(actions?.blueprints ?? null);
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(1);

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
    setPages(1);
  }

  const uses = useMemo(() => (catalog ? materialUsesFor(catalog, typeId) : []), [catalog, typeId]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? uses.filter((use) => use.productName.toLowerCase().includes(q)) : uses;
  }, [uses, query]);

  // Every row is an item menu, which needs the page's Item Actions.
  if (!actions || uses.length === 0) return null;

  const visible = filtered.slice(0, pages * USED_IN_PAGE);

  return (
    <section>
      <CloseOnNavigate onNavigate={onNavigate} />
      <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.itemDetail.usedInTitle', {
          count: uses.length,
          formatted: uses.length.toLocaleString(),
        })}
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
                  <ItemInfoLink typeId={use.productTypeID} className="truncate">
                    {use.productName}
                  </ItemInfoLink>
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
                  <RowMoreActions />
                </span>
              </li>
            </ItemContextMenu>
          ))}
        </ul>
      )}
      {visible.length < filtered.length && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setPages((n) => n + 1)}>
          {t('market.itemDetail.usedInShowMore', {
            shown: visible.length.toLocaleString(),
            total: filtered.length.toLocaleString(),
          })}
        </Button>
      )}
    </section>
  );
}

/** Calls `onNavigate` on the first location change after mount. */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const { key } = useLocation();
  const mountedAt = useRef(key);
  useEffect(() => {
    if (key !== mountedAt.current) onNavigate();
  }, [key, onNavigate]);
  return null;
}
