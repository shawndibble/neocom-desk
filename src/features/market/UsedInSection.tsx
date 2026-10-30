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
import { useLocation, useNavigationType } from 'react-router-dom';
import { Button, Disclosure, RowMoreActions, SearchInput, TypeIcon } from '@/components/ui';
import {
  loadBlueprintCatalog,
  materialUsesFor,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { ItemContextMenu } from './ItemContextMenu';
import { ItemInfoLink } from '@/features/entities';
import { withoutEntityInfo } from '@/lib/entityInfo';
import { useOptionalItemActions } from './itemActions';
import { formatCount } from '@/lib/formatCount';

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
  // null = the default: open for a short list, closed above the filter threshold.
  const [toggled, setToggled] = useState<boolean | null>(null);

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
    setToggled(null);
  }

  const uses = useMemo(() => (catalog ? materialUsesFor(catalog, typeId) : []), [catalog, typeId]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? uses.filter((use) => use.productName.toLowerCase().includes(q)) : uses;
  }, [uses, query]);

  // Every row is an item menu, which needs the page's Item Actions.
  if (!actions || uses.length === 0) return null;

  const visible = filtered.slice(0, pages * USED_IN_PAGE);
  const expanded = toggled ?? uses.length <= FILTER_THRESHOLD;

  return (
    <section>
      <CloseOnNavigate onNavigate={onNavigate} />
      <Disclosure
        label={t('market.itemDetail.usedInTitle', {
          count: uses.length,
          formatted: formatCount(uses.length),
        })}
        expanded={expanded}
        onToggle={() => setToggled(!expanded)}
        className="border-b border-line"
      >
        <div className="px-2.5 pb-1">
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
                          quantity: formatCount(use.quantity),
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
            <Button
              size="sm"
              variant="ghost"
              className="mt-1"
              onClick={() => setPages((n) => n + 1)}
            >
              {t('market.itemDetail.usedInShowMore', {
                shown: formatCount(visible.length),
                total: formatCount(filtered.length),
              })}
            </Button>
          )}
        </div>
      </Disclosure>
    </section>
  );
}

/**
 * Calls `onNavigate` once the page or its params (other than `?info`) change
 * after mount. A replace onto another path is a redirect, not a navigation away (a cold
 * `/market?info=…` landing on `/market/browser`, see `EntityInfoRoute`): it
 * becomes the new starting point instead.
 */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const { key, pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const mountedAt = useRef({ key, pathname, search: withoutEntityInfo(search) });
  useEffect(() => {
    // A drill-down only moves `?info` (the same page, another item): not a navigation away.
    const start = mountedAt.current;
    if (key === start.key) return;
    if (pathname === start.pathname && withoutEntityInfo(search) === start.search) return;
    if (navigationType === 'REPLACE' && pathname !== start.pathname) {
      mountedAt.current = { key, pathname, search: withoutEntityInfo(search) };
      return;
    }
    onNavigate();
  }, [key, pathname, search, navigationType, onNavigate]);
  return null;
}
