/**
 * A Market Trend widget's two settings, offered from its menu: which Trade
 * Hubs it prices at (a checkbox group in the menu itself) and which items it
 * draws (a dialog, since the choice is a list of up to a few hundred names).
 *
 * Neither is stored until it differs from the default: no hubs picked is the
 * pilot's Market hub, no items picked is the Quickbar.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  Modal,
  NativeSelect,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { useQuickbar } from '@/features/market/useQuickbar';
import { useMarketHub } from '@/features/market/hub';
import { TRADE_HUBS } from '@/market/hubs';
import { planTrendSeries, TREND_MAX_SERIES } from '@/engine/market/trendSeries';
import { useGlobalMarketOverrides } from '@/features/market/orderBookView';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewEdit } from './editContext';
import { MAX_TREND_HUBS, type Widget } from './layout';
import {
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
  const [catalogue, setCatalogue] = useState<Catalogue>({ status: 'idle' });

  // The market catalogue is a lazy download; only choosing a source that needs it fetches it, once.
  const requested = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = (next: SourceChoice) => {
    setSource(next);
    if (next === 'quickbar' || requested.current) return;
    requested.current = true;
    setCatalogue({ status: 'loading' });
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

  const listed: TrendSourceItem[] =
    source === 'quickbar'
      ? quickbar.map(({ typeId, name }) => ({ typeId, name }))
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
  const toggle = (typeId: number, on: boolean) =>
    setEdited(on ? [...picked, typeId] : picked.filter((id) => id !== typeId));

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

        <ul
          className="grid max-h-72 gap-1 overflow-y-auto"
          aria-label={t('overview.menu.trendList')}
        >
          {listed.map((item) => {
            const on = picked.includes(item.typeId);
            return (
              <li key={item.typeId}>
                <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                  <Checkbox
                    checked={on}
                    disabled={!on && full}
                    onChange={(event) => toggle(item.typeId, event.target.checked)}
                  />
                  {item.name}
                </label>
              </li>
            );
          })}
        </ul>
        {source === 'quickbar' && quickbar.length === 0 && (
          <p className="text-xs text-text-dim">{t('overview.menu.trendQuickbarEmpty')}</p>
        )}
        {source !== 'quickbar' && catalogue.status === 'loading' && (
          <p className="text-xs text-text-dim" role="status">
            {t('overview.menu.trendLoading')}
          </p>
        )}
        {source !== 'quickbar' && catalogue.status === 'failed' && (
          <p className="text-xs text-danger" role="alert">
            {t('overview.menu.trendLoadFailed')}{' '}
            <Button type="button" size="sm" onClick={() => choose(source)}>
              {t('overview.menu.trendRetry')}
            </Button>
          </p>
        )}

        <p className="text-xs text-text-dim" aria-live="polite">
          {t('overview.menu.trendPicked', { count: picked.length, max: TREND_MAX_SERIES })}
          {picked.length > 0 &&
            ` ${picked.map((id) => names.get(id) ?? t('overview.menu.trendUnknownItem', { id })).join(', ')}`}
        </p>
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
