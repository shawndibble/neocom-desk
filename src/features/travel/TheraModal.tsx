/**
 * Thera / Turnur, a modal on Route Safety (issues #2330, #2499; it was a
 * Travel tab until the modal scope decision): the current wormhole connections
 * out of the two public hubs, from EVE-Scout, as a slim table of open holes
 * with each exit's jump distance from the page's From, counted by the page's
 * own route rules. Use in route pins a hole on the route's first leg.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a row gives the
 * exit's security, the hole's size and remaining life; the pilot decides.
 *
 * Hub, Exit and Fits are local to the modal (not in the URL) and start at
 * Both, K-space and Any each time it opens. Under K-space, holes into J-space
 * have no gate route from anywhere, so they fold into a group under the table
 * instead of sinking to its bottom.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  Disclosure,
  EmptyState,
  Modal,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import {
  countTheraConnectionsByHub,
  filterTheraConnections,
  longestLifeFirst,
  THERA_EXITS,
  THERA_HUBS,
  WORMHOLE_SHIP_SIZES,
  type TheraConnectionFilter,
  type TheraConnectionRow,
  type TheraHub,
  type WormholeShipSize,
} from '@/engine/route/theraConnections';
import type { RouteQuery } from '@/features/route/routeRules';
import { useSystemName } from '@/features/route/useSolarSystems';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { TheraTable } from './TheraTable';
import { useTheraConnections, type TheraConnectionsState } from './useTheraConnections';

type HubOption = TheraHub | 'all';
type SizeOption = WormholeShipSize | 'any';

const HUB_OPTIONS: readonly HubOption[] = ['all', ...THERA_HUBS];
const SIZE_OPTIONS: readonly SizeOption[] = ['any', ...WORMHOLE_SHIP_SIZES];

const DEFAULT_FILTER = { hub: 'all', exit: 'kspace', shipSize: 'any' } as const;

export interface TheraModalProps {
  open: boolean;
  onClose: () => void;
  /** The Route Safety page's From: where each exit's jumps are counted from. */
  originId: number | null;
  /** The page's route rules, so a jump count here is the one the route would use. */
  routeQuery: RouteQuery;
  /** Pins the hole on the route's first leg. */
  onUse: (holeId: string) => void;
}

/** Mounted only while open, so the filters and the EVE-Scout read start fresh each time. */
export function TheraModal({ open, onClose, ...rest }: TheraModalProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('travel.thera.modalTitle')}
      placement={isPhone ? 'sheet-full' : 'wide'}
    >
      <TheraModalBody {...rest} />
    </Modal>
  );
}

function TheraModalBody({
  originId,
  routeQuery,
  onUse,
}: Omit<TheraModalProps, 'open' | 'onClose'>) {
  const { t } = useTranslation();
  const originName = useSystemName(originId);
  const state = useTheraConnections(originId, routeQuery);
  const [filter, setFilter] = useState<Required<TheraConnectionFilter>>(DEFAULT_FILTER);
  const hubCounts = countTheraConnectionsByHub(state.kind === 'ready' ? state.rows : [], filter);

  const hubOptions = HUB_OPTIONS.map((hub) => ({
    value: hub,
    label: t('travel.thera.hubOption', {
      hub: t(`travel.thera.hub.${hub}`),
      count: hubCounts[hub],
    }),
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-text-dim">
        <p>
          {originId === null
            ? t('travel.thera.noOrigin')
            : t('travel.thera.originNote', { system: originName ?? '…' })}
        </p>
        {state.kind === 'ready' && (
          <DataAgeBadge date={state.fetchedAt} note={t('travel.thera.dataAgeNote')} />
        )}
      </div>
      {/* One row, one size: every control takes `md` (DESIGN.md §3). */}
      <div className="flex flex-wrap items-end gap-3">
        <Labelled label={t('travel.thera.hubLabel')}>
          <SegmentedControl
            label={t('travel.thera.hubLabel')}
            options={hubOptions}
            value={filter.hub}
            onChange={(hub) => setFilter((was) => ({ ...was, hub }))}
            size="md"
            uppercase={false}
          />
        </Labelled>
        <Labelled label={t('travel.thera.exitLabel')}>
          <OptionSelect
            label={t('travel.thera.exitLabel')}
            value={filter.exit}
            options={THERA_EXITS}
            optionLabel={(exit) => t(`travel.thera.exit.${exit}`)}
            onChange={(exit) => setFilter((was) => ({ ...was, exit }))}
          />
        </Labelled>
        <Labelled label={t('travel.thera.fitsLabel')}>
          <OptionSelect
            label={t('travel.thera.fitsLabel')}
            value={filter.shipSize}
            options={SIZE_OPTIONS}
            optionLabel={(size) => t(`travel.thera.fits.${size}`)}
            onChange={(shipSize) => setFilter((was) => ({ ...was, shipSize }))}
          />
        </Labelled>
      </div>
      <TheraBody
        state={state}
        filter={filter}
        hasOrigin={originId !== null}
        originName={originName}
        onUse={originId === null ? undefined : (row) => onUse(row.id)}
        onResetFilters={
          (Object.keys(DEFAULT_FILTER) as (keyof typeof DEFAULT_FILTER)[]).some(
            (key) => filter[key] !== DEFAULT_FILTER[key]
          )
            ? () => setFilter(DEFAULT_FILTER)
            : undefined
        }
      />
    </div>
  );
}

/** A micro-label over a control: the row reads left to right, each group named once. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span aria-hidden="true" className={eyebrowClassName}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** A labelled select sized to the row's one control size. */
function OptionSelect<V extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly V[];
  optionLabel: (option: V) => string;
  onChange: (next: V) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as V)}>
      <SelectTrigger size="md" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {optionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TheraBody({
  state,
  filter,
  hasOrigin,
  originName,
  onUse,
  onResetFilters,
}: {
  state: TheraConnectionsState;
  filter: TheraConnectionFilter;
  hasOrigin: boolean;
  originName: string | null;
  onUse?: (row: TheraConnectionRow) => void;
  /** Set while any filter is off its default. */
  onResetFilters?: () => void;
}) {
  const { t } = useTranslation();
  const [resultRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    state.kind === 'loading' ? 'busy' : state.kind === 'unavailable' ? 'failed' : 'ok',
    null
  );
  // One wrapper in every state, so focus on Retry has somewhere to stay while the list loads.
  const wrap = (children: ReactNode) => (
    <div ref={resultRef} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );
  if (state.kind === 'loading') {
    return wrap(
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (state.kind === 'unavailable') {
    return wrap(
      <EmptyState
        title={t('travel.thera.unavailableTitle')}
        hint={t('travel.thera.unavailableHint')}
        action={
          <Button
            size="sm"
            onClick={() => {
              holdFocus();
              state.retry();
            }}
          >
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  // Longest-lived first: the table's jumps sort is stable, so ties (every
  // J-space hole) keep this order.
  const ordered = longestLifeFirst(state.rows);
  const rows = filterTheraConnections(ordered, filter);
  // Under K-space the holes into J-space fold under the table; any other
  // exit filter shows exactly what it names.
  const jspace =
    filter.exit === 'kspace'
      ? filterTheraConnections(ordered, { ...filter, exit: 'wormhole' })
      : [];
  // One live region, always mounted, so a change of message is announced.
  const jumpsNote = !hasOrigin
    ? ''
    : state.distancesLoading
      ? t('travel.thera.jumpsLoading')
      : state.originUngated
        ? t('travel.thera.originUngated', { system: originName ?? '…' })
        : state.rows.some((row) => row.jumps.kind === 'unknown')
          ? t('travel.thera.jumpsUnknown')
          : '';
  const listed = state.rows.length > 0;
  return wrap(
    <div className="space-y-3">
      <p role="status" className={cx('text-sm text-text-dim', jumpsNote === '' && 'sr-only')}>
        {jumpsNote}
      </p>
      {rows.length > 0 ? (
        <TheraTable
          rows={rows}
          onUse={onUse}
          label={
            filter.exit === 'wormhole'
              ? t('travel.thera.jspaceTableLabel')
              : t('travel.thera.tableLabel')
          }
        />
      ) : (
        <EmptyState
          title={
            !listed
              ? t('travel.thera.emptyTitle')
              : jspace.length > 0
                ? t('travel.thera.noKspaceMatchTitle')
                : t('travel.thera.noMatchTitle')
          }
          hint={listed ? t('travel.thera.noMatchHint') : t('travel.thera.emptyHint')}
          action={
            // Only a zero the filters made: when EVE-Scout lists nothing,
            // there is nothing to reset.
            listed && onResetFilters ? (
              <Button size="sm" onClick={onResetFilters}>
                {t('common.resetFilters')}
              </Button>
            ) : undefined
          }
        />
      )}
      {jspace.length > 0 && <JspaceGroup rows={jspace} />}
    </div>
  );
}

/** Holes into J-space under the K-space table: collapsed, and the same rows when opened. */
function JspaceGroup({ rows }: { rows: readonly TheraConnectionRow[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <Disclosure
      label={t('travel.thera.jspaceGroup', { count: rows.length })}
      expanded={expanded}
      onToggle={() => setExpanded((was) => !was)}
      className="rounded-xs border border-line"
    >
      <TheraTable rows={rows} label={t('travel.thera.jspaceTableLabel')} />
    </Disclosure>
  );
}
