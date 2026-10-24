/**
 * One tile on the Overview: a header (the title, which is the link to the
 * widget's page, a character scope chip, a settings button) over a body that is one of the five Widget
 * States.
 *
 * The body is a Number, a Chart or a Table, and **the headline number is always
 * on screen**: the Table view carries it as a line above its rows, the Chart
 * view above its chart (with the table beside it at Large and Full), and a kind
 * with no chart falls back to the Number. The Number view is only a number:
 * never a mini chart or a sparkline.
 * Every state is drawn for real rather than collapsing to blank: a widget that
 * vanishes when it has nothing to say cannot be told from one that failed to
 * load.
 *
 * No view-cyclers in the header: view switching lives in the settings menu, so
 * a stray click changes nothing.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRosterNames } from './useRosterNames';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import {
  Button,
  IskAmount,
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
  entityLinkClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { GrantBanner } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewRefresh } from './data/refreshContext';
import type { KindView, NumberModel, NumberSecondary } from './data/types';
import { useWidgetView } from './data/useWidgetView';
import { getKind } from './kinds';
import { Chart } from './charts/Chart';
import { DEFAULT_RANGE, type Widget as WidgetModel } from './layout';
import { scopePresentation } from './scope';
import { OVERVIEW_TICK_MS } from './data/tick';
import { resolveWidget } from './state';
import { TableBody, type TableBodyProps } from './TableBody';
import { useOverviewEdit } from './editContext';
import { DEFAULT_ROWS_PER_PAGE } from './tableSortPage';
import { TABLE_ROWS, tableOf } from './tableModel';
import {
  estimatedBodyHeight,
  heightKey,
  rememberBodyHeight,
  rememberedBodyHeight,
} from './skeletonHeight';

interface WidgetProps {
  widget: WidgetModel;
  /** The pilot is customizing: a dashed edge; the controls arrive as `headerStart` and `editControls`. */
  editing?: boolean;
  /** The settings menu (its own trigger, so Radix owns focus and Esc); absent in the Gallery's preview. */
  menu?: ReactNode;
  /** Before the title in the header: the drag handle while customizing on desktop. */
  headerStart?: ReactNode;
  /** A strip under the body while customizing: size, move and remove. */
  editControls?: ReactNode;
  /** Draw this sample instead of the live read: the Gallery's inert preview. */
  previewView?: KindView;
  /** The Gallery's preview already sits under the kind's name: draw the body alone, no header. */
  hideHeader?: boolean;
  /**
   * Draw the title as the link would look (with its caret) but as plain text: the
   * signed-out landing page's demo, where every destination is a route the visitor cannot reach.
   */
  inertTitle?: boolean;
  /** The empty state's Remove widget. */
  onRemove: (id: string) => void;
}

const SECONDARY_TONE = {
  good: 'text-isk-pos',
  bad: 'text-danger',
  caution: 'text-warning',
} as const;

const DIRECTION_GLYPH = {
  up: Icon.Ascending,
  down: Icon.Descending,
  flat: Icon.Decrease,
} as const;

/** The one line under the headline: a glyph for a direction, then text, on one line at every size. */
function SecondaryLine({ secondary }: { secondary: NumberSecondary }) {
  const Glyph = secondary.direction ? DIRECTION_GLYPH[secondary.direction] : null;
  return (
    <p
      className={cx(
        'flex min-w-0 items-center gap-1 text-[0.8125rem]',
        secondary.tone ? SECONDARY_TONE[secondary.tone] : 'text-text-dim'
      )}
    >
      {Glyph && <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />}
      <span className="min-w-0 truncate">{secondary.text}</span>
    </p>
  );
}

function NumberBody({ model, dimmed = false }: { model: NumberModel; dimmed?: boolean }) {
  const toned = model.tone !== 'clear';
  return (
    <div className={cx('grid gap-1 px-3 py-2.5', dimmed && 'opacity-45')}>
      <div
        className={cx(
          'flex flex-wrap items-baseline gap-x-1.5 text-2xl leading-tight font-semibold tabular-nums',
          toned ? SEVERITY_TEXT[model.tone] : 'text-text'
        )}
      >
        {toned && <SeverityIcon severity={model.tone} size="1rem" className="self-center" />}
        <span className="min-w-0 break-words">
          {model.iskAmount === undefined ? (
            model.value
          ) : (
            <IskAmount value={model.iskAmount} decimals={0} />
          )}
        </span>
        {model.unit && (
          <small className="text-xs font-normal tracking-normal text-text-dim">{model.unit}</small>
        )}
      </div>
      {model.secondary && <SecondaryLine secondary={model.secondary} />}
      {model.notes?.map((note) => (
        <p key={note} className="text-xs text-text-dim">
          {note}
        </p>
      ))}
      {model.link && (
        <Link
          to={model.link.to}
          className={entityLinkClassName('flex w-fit items-center gap-0.5 text-xs')}
        >
          {model.link.label}
          <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        </Link>
      )}
    </div>
  );
}

/** The Table view: the headline, then the kind's table at this size's rows and columns. */
function TableViewBody({
  view,
  size,
  title,
  paging,
}: {
  view: KindView;
  size: WidgetModel['size'];
  title: string;
  paging: TableBodyProps['paging'];
}) {
  return (
    <div>
      {/* The headline stays on screen in every view; its secondary line is the table's job here. */}
      <NumberBody
        model={{ ...view.number, secondary: undefined, notes: undefined, link: undefined }}
      />
      <TableBody
        table={tableOf(view)}
        columnsFor={size}
        rowLimit={TABLE_ROWS[size]}
        paging={paging}
        ariaLabel={title}
        className="border-t border-line"
      />
    </div>
  );
}

/**
 * The Chart view: the headline stays on screen above the chart (a Small chart
 * still shows its value), the chart's caption and hidden text summary below.
 * At Large and Full the table sits beside the chart (stacked below it on a
 * phone), with no toggle: the View menu is the only switcher. A kind with no
 * chart for this data falls back to the Number, never a blank.
 */
function ChartBody({
  view,
  size,
  title,
}: {
  view: KindView;
  size: WidgetModel['size'];
  title: string;
}) {
  if (!view.chart) return <NumberBody model={view.number} />;
  const table = size === 'L' || size === 'F' ? tableOf(view) : null;
  const beside = table !== null && table.rows.length > 0;
  return (
    <div>
      <NumberBody model={{ ...view.number, notes: undefined, link: undefined }} />
      <div className={cx(beside && 'md:flex md:items-start')}>
        <Chart
          model={view.chart}
          size={size}
          className={cx('px-3 pb-2.5', beside && 'md:w-[55%] md:shrink-0')}
        />
        {beside && (
          <TableBody
            table={table}
            columnsFor={size === 'F' ? 'M' : 'S'}
            rowLimit={size === 'F' ? 8 : 5}
            ariaLabel={title}
            className="border-t border-line md:min-w-0 md:flex-1 md:border-t-0 md:border-l"
          />
        )}
      </div>
    </div>
  );
}

/** The fixed scope readout (DESIGN §6c): this widget reads every Character on the device. */
function AllCharactersReadout({ compact }: { compact: boolean }) {
  const total = useRosterNames()?.size;
  if (!total) return null;
  return <CharacterScopeReadout scope="all" total={total} compact={compact} />;
}

/** The same readout in its "Name only" form: All was asked for, but this kind reads one Character. */
function HeaderCharacterReadout({ characterId }: { characterId: number }) {
  const name = useRosterNames()?.get(characterId);
  if (name === undefined) return null;
  return <CharacterScopeReadout scope="one" characterId={characterId} characterName={name} />;
}

/** `minHeight` holds the body's settled height, so the board does not jump when the data lands. */
function Skeleton({ minHeight }: { minHeight: number }) {
  const { t } = useTranslation();
  const bar = 'block animate-pulse rounded-xs bg-line motion-reduce:animate-none';
  return (
    <div className="grid content-start gap-2 px-3 py-3" style={{ minHeight }}>
      <span aria-hidden="true" className={cx(bar, 'h-6 w-[45%]')} />
      <span aria-hidden="true" className={cx(bar, 'h-3 w-[70%]')} />
      <span className="sr-only">{t('overview.widgets.loading')}</span>
    </div>
  );
}

/**
 * The live read lives in its own component so the Gallery's preview, which
 * supplies its own sample view, renders `WidgetFrame` directly and so never
 * starts a live builder per previewed kind.
 */
export function Widget(props: WidgetProps) {
  return props.previewView ? (
    <WidgetFrame {...props} view={props.previewView} />
  ) : (
    <LiveWidget {...props} />
  );
}

function LiveWidget(props: WidgetProps) {
  const { widget } = props;
  const kind = getKind(widget.kind);
  const scope = scopePresentation(widget.kind, widget.scope);
  const view = useWidgetView(
    widget.kind,
    scope.scopeAll,
    kind?.hasRange ? (widget.range ?? DEFAULT_RANGE) : undefined,
    kind?.hasPlexPlan ? widget.plexPer30Days : undefined,
    kind?.hasCalendarEvents ? widget.calendarEvents : undefined,
    kind?.hasRaidsWhere ? widget.raidsWhere : undefined,
    kind?.hasRaidsWhere ? widget.raidsRadius : undefined
  );
  return <WidgetFrame {...props} view={view} rememberHeight />;
}

/**
 * Remembers the body's settled height under `key` (see `skeletonHeight.ts`)
 * while `active`, so the next load's skeleton stands as tall as this one ended.
 */
function useRememberHeight(key: string, active: boolean) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || !node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[entries.length - 1]?.borderBoxSize?.[0]?.blockSize;
      if (height !== undefined) rememberBodyHeight(key, height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [key, active, node]);
  return setNode;
}

function WidgetFrame({
  widget,
  editing = false,
  menu,
  headerStart,
  editControls,
  view,
  hideHeader = false,
  inertTitle = false,
  onRemove,
  rememberHeight = false,
}: Omit<WidgetProps, 'previewView'> & {
  view: KindView;
  /** A live widget: remember its settled body height for the next load's skeleton. */
  rememberHeight?: boolean;
}) {
  const { t } = useTranslation();
  const kind = getKind(widget.kind);
  const { refresh } = useOverviewRefresh();
  const { setRowsPerPage } = useOverviewEdit();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const now = useTicker(OVERVIEW_TICK_MS);
  const scope = scopePresentation(widget.kind, widget.scope);
  const { state, showLastGood, reauthNote } = resolveWidget(view.status);
  const isPhone = useIsPhone();
  const sizeKey = heightKey(widget, characterId, isPhone);
  // A view that draws while one of its reads is still out (the Wallet's balance before its
  // journal) is not at its height yet: it keeps the skeleton's reserve until the read lands.
  const settling = rememberHeight && state === 'ok' && view.settling === true;
  // Only a settled body is worth standing the next skeleton at: a short error or permission
  // prompt is a passing state, not this widget's height.
  const measureRef = useRememberHeight(
    sizeKey,
    rememberHeight && (state === 'ok' || state === 'empty') && !settling
  );
  const reserved = () =>
    (rememberHeight ? rememberedBodyHeight(sizeKey) : undefined) ??
    estimatedBodyHeight(widget, isPhone);

  // The grid only draws kinds it knows; a widget rendered alone without one has no title to show.
  if (!kind) return null;
  const title = widget.title ?? t(kind.titleKey);

  let body;
  if (state === 'loading') {
    body = <Skeleton minHeight={reserved()} />;
  } else if (state === 'needsPermission') {
    body = (
      <div className="grid gap-2 p-3 text-[0.8125rem]">
        {characterId !== null && kind.endpoints.length > 0 ? (
          <GrantBanner
            variant="ghost"
            characterId={characterId}
            endpoints={kind.endpoints}
            title={t('overview.widgets.needsPermission')}
            hint={t('overview.widgets.needsPermissionHint', { title })}
            actionLabel={t('overview.widgets.grantAction')}
          />
        ) : (
          <>
            <b>{t('overview.widgets.needsPermission')}</b>
            <p className="text-text-dim">{t('overview.widgets.needsPermissionHint', { title })}</p>
          </>
        )}
      </div>
    );
  } else if (state === 'failed') {
    body = (
      <div role="alert" className="grid gap-2 p-3 text-[0.8125rem]">
        <b className="flex items-center gap-1.5 text-danger">
          <SeverityIcon severity="critical" />
          {t('overview.widgets.failed.title')}
        </b>
        <span className="text-text-dim">
          {showLastGood && view.fetchedAt
            ? t('overview.widgets.failed.lastGood', {
                age: formatAge(Math.max(0, now - view.fetchedAt.getTime()), t),
              })
            : showLastGood
              ? t('overview.widgets.failed.lastGoodUndated')
              : t('overview.widgets.failed.nothing')}
        </span>
        {showLastGood && <NumberBody model={{ ...view.number, link: undefined }} dimmed />}
        <span>
          <Button size="sm" onClick={refresh}>
            {t('overview.widgets.failed.retry')}
          </Button>
        </span>
      </div>
    );
  } else if (state === 'empty') {
    body = (
      <div className="grid gap-2 p-3 text-[0.8125rem]">
        <b>{view.emptyMessage ?? t(kind.emptyMessageKey)}</b>
        {!view.emptyHealthy && (
          <span className="text-text-dim">{view.emptyHint ?? t('overview.widgets.emptyHint')}</span>
        )}
        {view.to !== null && view.emptyLinkLabel !== undefined && (
          <Link to={view.to} className={entityLinkClassName('w-fit')}>
            {view.emptyLinkLabel}
          </Link>
        )}
        {!view.emptyHealthy && (
          <span>
            <Button size="sm" onClick={() => onRemove(widget.id)}>
              {t('overview.widgets.remove')}
            </Button>
          </span>
        )}
      </div>
    );
  } else {
    body =
      widget.view === 'table' ? (
        <TableViewBody
          view={view}
          size={widget.size}
          title={title}
          paging={{
            rowsPerPage: widget.rowsPerPage ?? DEFAULT_ROWS_PER_PAGE,
            onRowsPerPage: (rows) => setRowsPerPage(widget.id, rows),
          }}
        />
      ) : widget.view === 'chart' ? (
        <ChartBody view={view} size={widget.size} title={title} />
      ) : (
        <NumberBody model={view.number} />
      );
  }

  // A lapsed grant over saved data: the figures stay, with a small note to log in again.
  if (reauthNote && characterId !== null && kind.endpoints.length > 0) {
    body = (
      <>
        {body}
        <ReauthCachedNote
          className="px-3 pb-3"
          characterId={characterId}
          endpoints={kind.endpoints}
        />
      </>
    );
  }

  if (state === 'ok' && view.grantEndpoints !== undefined && characterId !== null) {
    body = (
      <>
        {body}
        <div className="px-3 pb-3">
          <GrantBanner
            variant="ghost"
            characterId={characterId}
            endpoints={view.grantEndpoints}
            title={t('overview.widgets.needsPermission')}
            hint={t('overview.widgets.needsPermissionHint', { title })}
            actionLabel={t('overview.widgets.grantAction')}
          />
        </div>
      </>
    );
  }

  return (
    <section
      aria-label={title}
      aria-busy={state === 'loading'}
      className={cx(
        'flex h-full w-full min-w-0 flex-col rounded-xs border bg-panel',
        editing ? 'border-dashed border-line-bright' : 'border-line'
      )}
    >
      {!hideHeader && (
        <div
          className={cx(
            'flex items-center gap-1.5 border-b border-line pr-1 pl-2.5',
            tappableRowClassName
          )}
        >
          {headerStart}
          <h2 className="min-w-0 text-[0.6875rem] font-semibold tracking-widest uppercase">
            {view.to !== null && inertTitle ? (
              <span className="flex min-w-0 items-center gap-0.5 text-text">
                <span className="min-w-0 truncate">{title}</span>
                <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
              </span>
            ) : view.to !== null ? (
              <Tooltip content={t('overview.widgets.opensPage', { title })}>
                <Link
                  to={view.to}
                  className={entityLinkClassName(
                    cx('flex min-w-0 items-center gap-0.5 text-text', tappableRowClassName)
                  )}
                >
                  <span className="min-w-0 truncate">{title}</span>
                  <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
                </Link>
              </Tooltip>
            ) : (
              <span className="block truncate text-text">{title}</span>
            )}
          </h2>
          {scope.chip && <AllCharactersReadout compact={widget.size === 'S'} />}
          <span className="flex-1" />
          {menu}
        </div>
      )}
      <div className="flex-1" style={settling ? { minHeight: reserved() } : undefined}>
        {/* Measured, not the stretched `flex-1` box: a row's tallest widget sets the others' height. */}
        <div ref={measureRef}>{body}</div>
      </div>
      {editControls}
      {scope.fallbackNote && state === 'ok' && characterId !== null && (
        <div className="border-t border-line px-3 py-1.5">
          <HeaderCharacterReadout characterId={characterId} />
        </div>
      )}
    </section>
  );
}
