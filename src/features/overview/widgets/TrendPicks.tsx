/**
 * A Market Trend widget's two settings, offered from its menu: which Trade
 * Hubs it prices at (a checkbox group in the menu itself) and which items it
 * draws (a dialog, since the choice is a list of up to a few hundred names).
 *
 * Neither is stored until it differs from the default: no hubs picked is the
 * pilot's Market hub, no items picked is the Quickbar.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  IconButton,
  Modal,
  NativeSelect,
  SearchInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  disabledClassName,
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { useQuickbar } from '@/features/market/useQuickbar';
import { useMarketHub } from '@/features/market/hub';
import { TRADE_HUBS } from '@/market/hubs';
import { planTrendSeries, TREND_MAX_SERIES } from '@/engine/market/trendSeries';
import { useGlobalMarketOverrides } from '@/features/market/orderBookView';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewEdit } from './editContext';
import { MAX_TREND_HUBS, type Widget } from './layout';
import {
  searchTrendItems,
  TREND_SOURCE_IDS,
  trendCatalogue,
  type TrendSource,
  type TrendSourceItem,
} from './trendCatalogue';

/** The hubs a widget prices at: its own picks, else the pilot's Market hub. */
function useTrendHubs(widget: Widget): { pilot: string; current: string[] } {
  const pilot = useMarketHub((state) => state.value);
  return { pilot, current: widget.trendHubs ?? [pilot] };
}

export function TrendHubsMenuGroup({ widget }: { widget: Widget }) {
  const { t } = useTranslation();
  const { setTrendHubs } = useOverviewEdit();
  const { pilot, current } = useTrendHubs(widget);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...current, id] : current.filter((hub) => hub !== id);
    // Back on the pilot's hub alone is the default, so nothing is stored.
    setTrendHubs(widget.id, next.length === 1 && next[0] === pilot ? [] : next);
  };
  return (
    <>
      <DropdownMenuLabel>{t('overview.menu.trendHubs')}</DropdownMenuLabel>
      {TRADE_HUBS.map((hub) => {
        const on = current.includes(hub.id);
        return (
          <DropdownMenuCheckboxItem
            key={hub.id}
            checked={on}
            disabled={on ? current.length === 1 : current.length >= MAX_TREND_HUBS}
            // The menu stays open, so several hubs are one visit.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(next) => toggle(hub.id, next)}
          >
            {hub.systemName}
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

type SourceChoice = 'quickbar' | TrendSource['id'];
const SOURCE_CHOICES: readonly SourceChoice[] = ['quickbar', ...TREND_SOURCE_IDS];

/** PLEX, the one global-market item known before the global markets list loads. */
const PLEX_TYPE_ID = 44992;

type Catalogue =
  { status: 'idle' | 'loading' | 'failed' } | { status: 'ready'; sources: TrendSource[] };

export function TrendItemsDialog({
  widget,
  title,
  open,
  onClose,
}: {
  widget: Widget;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { setTrendItems } = useOverviewEdit();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const quickbar = useQuickbar(characterId).items;
  const { current: hubs } = useTrendHubs(widget);
  // Global-market items are drawn once whatever the hubs; until the list loads only PLEX is known to be.
  const globals = useGlobalMarketOverrides(open);
  const [source, setSource] = useState<SourceChoice>('quickbar');
  // Null until the pilot edits, so a Quickbar that loads after the dialog opens still seeds the list.
  const [edited, setEdited] = useState<number[] | null>(null);
  const picked =
    edited ?? widget.trendItems ?? quickbar.slice(0, TREND_MAX_SERIES).map((item) => item.typeId);
  // A widget's stored picks may not be in the Quickbar (the presets); their names come from the catalogue, so it loads on open.
  const needsNames = (widget.trendItems ?? []).some((id) => !quickbar.some((q) => q.typeId === id));
  const [catalogue, setCatalogue] = useState<Catalogue>({
    status: needsNames ? 'loading' : 'idle',
  });

  // The market catalogue is a lazy download; only choosing a source that needs it fetches it, once.
  const requested = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fetchCatalogue = () => {
    requested.current = true;
    void import('@/sde/loadMarketSde')
      .then(async ({ loadMarketGroups, loadMarketTypes }) =>
        trendCatalogue(await loadMarketGroups(), await loadMarketTypes())
      )
      .then(
        (sources) => mounted.current && setCatalogue({ status: 'ready', sources }),
        () => {
          requested.current = false;
          if (mounted.current) setCatalogue({ status: 'failed' });
        }
      );
  };
  useEffect(() => {
    if (needsNames && !requested.current) fetchCatalogue();
    // Once, on open: the initial state above already shows loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const loadCatalogue = () => {
    if (requested.current) return;
    setCatalogue({ status: 'loading' });
    fetchCatalogue();
  };
  const choose = (next: SourceChoice) => {
    setSource(next);
    if (next !== 'quickbar') loadCatalogue();
  };
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const noteId = useId();

  const quickbarList = quickbar.map(({ typeId, name }) => ({ typeId, name }));
  const hits = searching
    ? searchTrendItems(
        [
          { id: 'quickbar', items: quickbarList },
          ...(catalogue.status === 'ready' ? catalogue.sources : []),
        ],
        query
      )
    : [];
  const rows: (TrendSourceItem & { sourceId?: SourceChoice })[] = searching
    ? hits
    : source === 'quickbar'
      ? quickbarList
      : catalogue.status === 'ready'
        ? (catalogue.sources.find((s) => s.id === source)?.items ?? [])
        : [];
  const names = new Map<number, string>(quickbar.map((item) => [item.typeId, item.name]));
  if (catalogue.status === 'ready') {
    for (const s of catalogue.sources)
      for (const item of s.items) names.set(item.typeId, item.name);
  }
  const full = picked.length >= TREND_MAX_SERIES;
  const plan = planTrendSeries(picked, hubs, (id) => globals?.has(id) ?? id === PLEX_TYPE_ID);
  const drawnIds = new Set(plan.refs.map((ref) => ref.typeId));
  const hidden = picked
    .filter((id) => !drawnIds.has(id))
    .map((id) => names.get(id) ?? t('overview.menu.trendUnknownItem', { id }));
  const available = rows.filter((item) => !picked.includes(item.typeId));
  const resultsRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The row a pick leaves would drop keyboard focus with it; hand it to the next row, else the search box.
  const refocus = useRef(false);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const toggle = (typeId: number, on: boolean) => {
    refocus.current = on;
    setJustAdded(on ? typeId : null);
    setEdited(on ? [...picked, typeId] : picked.filter((id) => id !== typeId));
  };
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const next = resultsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    (next ?? searchRef.current)?.focus();
  }, [picked]);

  return (
    <Modal open={open} onClose={onClose} title={t('overview.menu.trendItemsTitle', { title })}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          // Untouched picks on a widget that follows the Quickbar: saving would detach it for nothing.
          const followed = quickbar.slice(0, TREND_MAX_SERIES).map((item) => item.typeId);
          const unchanged =
            picked.length === followed.length && picked.every((id, i) => id === followed[i]);
          if (!widget.trendItems?.length && (edited === null || unchanged)) {
            onClose();
            return;
          }
          setTrendItems(widget.id, picked);
          onClose();
        }}
      >
        <SearchInput
          ref={searchRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // A failed load is retried with the Retry button, not on every keystroke.
            if (event.target.value.trim() !== '' && catalogue.status === 'idle') loadCatalogue();
          }}
          onKeyDown={(event) => {
            // Enter searches; it must not submit the dialog's form.
            if (event.key === 'Enter') event.preventDefault();
          }}
          placeholder={t('overview.menu.trendSearchPlaceholder')}
          aria-label={t('overview.menu.trendSearch')}
        />
        {!searching && (
          <label className="grid gap-1 text-xs">
            <span className="font-semibold">{t('overview.menu.trendSource')}</span>
            <NativeSelect
              value={source}
              onChange={(event) => choose(event.target.value as SourceChoice)}
            >
              {SOURCE_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {t(`overview.menu.trendSources.${choice}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}

        <ul
          ref={resultsRef}
          className="grid max-h-60 gap-1 overflow-y-auto"
          aria-label={t('overview.menu.trendList')}
        >
          {/* A picked item leaves this list and shows only under Selected, so each item is in one place. */}
          {available.map((item) => (
            <li key={item.typeId}>
              <button
                type="button"
                disabled={full}
                aria-describedby={full ? noteId : undefined}
                aria-label={t('overview.menu.trendAdd', { name: item.name })}
                onClick={() => toggle(item.typeId, true)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-xs px-1 text-left text-sm',
                  tappableRowClassName,
                  rowInteractiveClassName,
                  focusRingInsetClassName,
                  disabledClassName
                )}
              >
                <Icon.AddRow size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 truncate">{item.name}</span>
                {item.sourceId !== undefined && (
                  <span className="ml-auto shrink-0 text-xs text-text-dim">
                    {t(`overview.menu.trendSources.${item.sourceId}`)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {!searching && rows.length > 0 && available.length === 0 && (
          <p className="text-xs text-text-dim">{t('overview.menu.trendAllPicked')}</p>
        )}
        {full && (
          <p id={noteId} className="text-xs text-text-dim">
            {t('overview.menu.trendFull', { max: TREND_MAX_SERIES })}
          </p>
        )}
        {searching && catalogue.status === 'ready' && hits.length === 0 && (
          <p className="text-xs text-text-dim">{t('overview.menu.trendNoMatch')}</p>
        )}
        {!searching && source === 'quickbar' && quickbar.length === 0 && (
          <p className="text-xs text-text-dim">{t('overview.menu.trendQuickbarEmpty')}</p>
        )}
        {(searching || source !== 'quickbar') && catalogue.status === 'loading' && (
          <p className="text-xs text-text-dim" role="status">
            {t('overview.menu.trendLoading')}
          </p>
        )}
        {(searching || source !== 'quickbar') && catalogue.status === 'failed' && (
          <p className="text-xs text-danger" role="alert">
            {t('overview.menu.trendLoadFailed')}{' '}
            <Button type="button" size="sm" onClick={loadCatalogue}>
              {t('overview.menu.trendRetry')}
            </Button>
          </p>
        )}

        <section aria-label={t('overview.menu.trendSelectedLabel')} className="grid gap-1">
          <h3 className="text-xs font-semibold" aria-live="polite">
            {t('overview.menu.trendSelected', { count: picked.length, max: TREND_MAX_SERIES })}
          </h3>
          <ul className="grid gap-1">
            {picked.map((id) => {
              const name = names.get(id) ?? t('overview.menu.trendUnknownItem', { id });
              return (
                <li
                  key={id}
                  className={cx(
                    'flex items-center justify-between gap-2 rounded-xs border border-line pl-2.5 text-sm',
                    id === justAdded && 'row-pulse'
                  )}
                >
                  <span className="min-w-0 truncate">{name}</span>
                  <IconButton
                    variant="plain"
                    size="sm"
                    icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
                    label={t('overview.menu.trendRemove', { name })}
                    onClick={() => toggle(id, false)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
        {picked.length > 0 && (
          <p
            className={plan.omitted > 0 ? 'text-xs text-warning' : 'text-xs text-text-dim'}
            role={plan.omitted > 0 ? 'alert' : undefined}
          >
            {plan.omitted > 0
              ? t('overview.menu.trendOverflow', {
                  drawn: plan.refs.length,
                  total: plan.refs.length + plan.omitted,
                  max: TREND_MAX_SERIES,
                })
              : t('overview.menu.trendLines', { count: plan.refs.length })}
            {hidden.length > 0 &&
              ` ${t('overview.menu.trendHidden', { names: hidden.join(', ') })}`}
          </p>
        )}
        <p className="text-xs text-text-dim">{t('overview.menu.trendHint')}</p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            onClick={() => {
              setTrendItems(widget.id, []);
              onClose();
            }}
          >
            {t('overview.menu.trendFollowQuickbar')}
          </Button>
          <Button type="button" onClick={onClose}>
            {t('overview.menu.trendCancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={picked.length === 0}>
            {t('overview.menu.trendSave')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
