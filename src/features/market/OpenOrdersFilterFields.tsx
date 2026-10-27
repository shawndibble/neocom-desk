import { useTranslation } from 'react-i18next';
import {
  Button,
  FilterChip,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import type { openOrderProblemCounts } from './openOrdersModel';
import {
  FILTERABLE_PROBLEMS,
  OPEN_ORDERS_SORTS,
  type locationFilterOptions,
  type OpenOrdersFilter,
  type OpenOrdersSort,
} from './openOrdersFilter';

const SORTS: readonly OpenOrdersSort[] = OPEN_ORDERS_SORTS;

/**
 * Every problem worth a funnel chip. The same set a deep link may name, and
 * deliberately the same constant: the funnel and the URL are two ways to reach
 * one filter, and `healthy` is excluded from both for the reason
 * `FILTERABLE_PROBLEMS` gives.
 */
const PROBLEM_FILTER_OPTIONS = FILTERABLE_PROBLEMS;

const EXPIRING_WITHIN_DAY_OPTIONS = [3, 7, 14, 30] as const;
const MIN_ISK_TIED_UP_OPTIONS = [10_000_000, 100_000_000, 1_000_000_000] as const;

interface OpenOrdersFilterFieldsProps {
  draft: OpenOrdersFilter;
  setDraft: (next: OpenOrdersFilter) => void;
  problemCounts: ReturnType<typeof openOrderProblemCounts>;
  locationOptions: ReturnType<typeof locationFilterOptions>;
  showLocationFilter: boolean;
}

/** The funnel box's fields: side, problems, cost basis, expiry, size, location, sort. */
export function OpenOrdersFilterFields({
  draft,
  setDraft,
  problemCounts,
  locationOptions,
  showLocationFilter,
}: OpenOrdersFilterFieldsProps) {
  const { t } = useTranslation();
  const locationSummary =
    draft.locationIds.length === 0
      ? t('market.orders.filter.allLocations')
      : t('market.orders.filter.selectedLocationsCount', { count: draft.locationIds.length });
  return (
    <>
      <FilterChip
        label={t('orders.buy')}
        selected={draft.side === 'buy'}
        onToggle={() => setDraft({ ...draft, side: draft.side === 'buy' ? null : 'buy' })}
      />
      <FilterChip
        label={t('orders.sell')}
        selected={draft.side === 'sell'}
        onToggle={() => setDraft({ ...draft, side: draft.side === 'sell' ? null : 'sell' })}
      />
      {PROBLEM_FILTER_OPTIONS.map((problem) => {
        const count = problemCounts[problem];
        const selected = draft.problems.includes(problem);
        return (
          <FilterChip
            key={problem}
            label={t(`market.orders.group.${problem}`)}
            count={count}
            selected={selected}
            // A zero-count problem still renders, still a real
            // focusable button, so the player can see it's clean
            // rather than wonder where it went — the `0` itself
            // is the cue; no `opacity-50` fade below AA on top of
            // it (issue #1491).
            onToggle={() =>
              setDraft({
                ...draft,
                problems: selected
                  ? draft.problems.filter((p) => p !== problem)
                  : [...draft.problems, problem],
              })
            }
          />
        );
      })}
      <FilterChip
        label={t('market.orders.filter.costBasisLinked')}
        selected={draft.costBasis === 'linked'}
        onToggle={() =>
          setDraft({
            ...draft,
            costBasis: draft.costBasis === 'linked' ? null : 'linked',
          })
        }
      />
      <FilterChip
        label={t('market.orders.filter.costBasisMissing')}
        selected={draft.costBasis === 'missing'}
        onToggle={() =>
          setDraft({
            ...draft,
            costBasis: draft.costBasis === 'missing' ? null : 'missing',
          })
        }
      />
      <Select
        value={draft.expiringWithinDays === null ? 'any' : String(draft.expiringWithinDays)}
        onValueChange={(value) =>
          setDraft({
            ...draft,
            expiringWithinDays: value === 'any' ? null : Number(value),
          })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={t('market.orders.filter.expiringWithin')}
          className="w-36"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t('market.orders.filter.anyExpiry')}</SelectItem>
          {EXPIRING_WITHIN_DAY_OPTIONS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t('market.orders.filter.expiringWithinOption', { count: days })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={draft.minIskTiedUp === null ? 'any' : String(draft.minIskTiedUp)}
        onValueChange={(value) =>
          setDraft({
            ...draft,
            minIskTiedUp: value === 'any' ? null : Number(value),
          })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={t('market.orders.filter.minIskTiedUp')}
          className="w-36"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t('market.orders.filter.anySize')}</SelectItem>
          {MIN_ISK_TIED_UP_OPTIONS.map((amount) => (
            <SelectItem key={amount} value={String(amount)}>
              {t('market.orders.filter.minIskTiedUpOption', {
                amount: formatIskCompact(amount),
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showLocationFilter && (
        <MultiSelect
          label={t('market.orders.filter.location')}
          size="sm"
          triggerLabel={locationSummary}
          options={locationOptions.map((option) => ({
            id: option.locationId,
            label: option.label,
          }))}
          selected={new Set(draft.locationIds)}
          onToggle={(locationId) =>
            setDraft({
              ...draft,
              locationIds: draft.locationIds.includes(locationId)
                ? draft.locationIds.filter((id) => id !== locationId)
                : [...draft.locationIds, locationId],
            })
          }
          searchPlaceholder={t('market.orders.filter.locationSearchPlaceholder')}
          noResultsLabel={t('market.orders.filter.locationNoResults')}
          extraContent={(close) => (
            <div className="border-b border-line p-1">
              <Button
                variant="ghost"
                align="start"
                size="sm"
                className="w-full"
                onClick={() => {
                  setDraft({ ...draft, locationIds: [] });
                  close();
                }}
              >
                {t('market.orders.filter.allLocations')}
              </Button>
            </div>
          )}
        />
      )}
      <Select
        value={draft.sort}
        onValueChange={(value) => setDraft({ ...draft, sort: value as OpenOrdersSort })}
      >
        <SelectTrigger size="sm" aria-label={t('market.orders.filter.sort')} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((sort) => (
            <SelectItem key={sort} value={sort}>
              {t(`market.orders.filter.sort${sort[0].toUpperCase()}${sort.slice(1)}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
