import { useEffect, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRosterNames } from './useRosterNames';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import {
  Button,
  entityLinkClassName,
  IskAmount,
  LiveStatus,
  RowMoreActions,
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { GrantBanner } from '@/app/GrantNote';
import { GrantCellMark } from '@/app/GrantCellMark';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewRefresh } from './data/refreshContext';
import type { KindView, NumberModel, NumberSecondary } from './data/types';
import { useWidgetView } from './data/useWidgetView';
import { getKind, widgetKeys } from './kinds';
import { endpointsOf } from './data/models';
import { Chart } from './charts/Chart';
import { Donut } from './charts/Donut';
import type { Widget as WidgetModel } from './layout';
import { scopePresentation } from './scope';
import { corpScope } from './layout';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useAccountCorporations } from '@/features/corp/accountCorporationsContext';
import { readScope, useWidgetBoard } from './board';
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
  editing?: boolean;
  menu?: (card: ReactElement, to: string | null) => ReactElement;
  headerStart?: ReactNode;
  editControls?: ReactNode;
  previewView?: KindView;
  hideHeader?: boolean;
  inertTitle?: boolean;
}

const SECONDARY_TONE = {
  good: 'text-isk-pos',
  bad: 'text-danger',
  caution: 'text-warning',
} as const;

const CARD_CLICK_IGNORES =
  'a[href], button, input, textarea, select, label, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="dialog"], [data-card-click-ignore]';

const DIRECTION_GLYPH = {
  up: Icon.Ascending,
  down: Icon.Descending,
  flat: Icon.Decrease,
} as const;

function SecondaryLine({ secondary }: { secondary: NumberSecondary }) {
  const Glyph = secondary.direction ? DIRECTION_GLYPH[secondary.direction] : null;
  return (
    <p
      className={cx(
        'flex min-w-0 items-center gap-1 text-sm',
        secondary.tone ? SECONDARY_TONE[secondary.tone] : 'text-text-dim'
      )}
    >
      {Glyph && <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />}
      <span className="min-w-0 truncate">{secondary.text}</span>
    </p>
  );
}

function NumberRings({ rings }: { rings: NonNullable<NumberModel['rings']> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {rings.map((ring) => (
        <li key={ring.key} className="flex items-center gap-1.5 text-sm tabular-nums">
          <Donut model={ring.donut} size={24} legend={false} />
          <span aria-hidden="true">{ring.label}</span>
          <span className="sr-only">{ring.donut.summary}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberBody({ model, dimmed = false }: { model: NumberModel; dimmed?: boolean }) {
  const toned = model.tone !== 'clear';
  const rings = model.rings ?? [];
  if (rings.length > 1) {
    return (
      <div className="grid gap-1.5 px-3 py-2.5">
        <NumberRings rings={rings} />
        {model.secondary && <SecondaryLine secondary={model.secondary} />}
        {model.notes?.map((note) => (
          <p key={note} className="text-xs text-text-dim">
            {note}
          </p>
        ))}
      </div>
    );
  }
  const only = rings[0];
  const figure = (
    <div className={only ? 'grid min-w-0 flex-1 gap-1' : 'grid gap-1 px-3 py-2.5'}>
      <div
        className={cx(
          'flex flex-wrap items-baseline gap-x-1.5 text-2xl leading-tight font-semibold tabular-nums',
          dimmed ? 'text-text-dim' : toned ? SEVERITY_TEXT[model.tone] : 'text-text'
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
          <Tooltip content={model.unit}>
            <small
              tabIndex={0}
              className="min-w-0 max-w-full truncate text-xs font-normal tracking-normal text-text-dim"
            >
              {model.unit}
            </small>
          </Tooltip>
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
  if (!only) return figure;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {figure}
      <Donut model={only.donut} size={56} legend={false} />
      <span className="sr-only">{only.donut.summary}</span>
    </div>
  );
}

function TableViewBody({
  view,
  size,
  title,
  paging,
  inert,
}: {
  view: KindView;
  size: WidgetModel['size'];
  title: string;
  paging: TableBodyProps['paging'];
  inert: boolean;
}) {
  const table = tableOf(view);
  return (
    <div>
      <NumberBody
        model={{ ...view.number, secondary: undefined, notes: undefined, link: undefined }}
      />
      <TableBody
        table={
          inert ? { ...table, rows: table.rows.map((row) => ({ ...row, to: undefined })) } : table
        }
        columnsFor={size}
        rowLimit={TABLE_ROWS[size]}
        paging={paging}
        ariaLabel={title}
        className="border-t border-line"
      />
    </div>
  );
}

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
            columnsFor={size === 'F' || table.fitWidth ? 'M' : 'S'}
            rowLimit={size === 'F' ? 8 : 5}
            ariaLabel={title}
            className="border-t border-line md:min-w-0 md:flex-1 md:border-t-0 md:border-l"
          />
        )}
      </div>
    </div>
  );
}

function AllCharactersReadout({ compact }: { compact: boolean }) {
  const total = useRosterNames()?.size;
  if (!total) return null;
  return <CharacterScopeReadout scope="all" total={total} compact={compact} />;
}

function CorporationReadout({
  corporationId,
  compact,
}: {
  corporationId: number;
  compact: boolean;
}) {
  const corporation = useAccountCorporations().find((c) => c.id === corporationId);
  return (
    <CharacterScopeReadout
      scope="corporation"
      name={corporation?.label.name ?? String(corporationId)}
      compact={compact}
    />
  );
}

function OneCorporationBody({
  title,
  wanted,
  onUse,
}: {
  title: string;
  wanted?: number;
  onUse: (() => void) | null;
}) {
  const { t } = useTranslation();
  const corporations = useAccountCorporations();
  const own = useActiveCorporationId();
  const name = corporations.find((c) => c.id === own)?.label.name;
  const wantedName =
    wanted === undefined
      ? undefined
      : (corporations.find((c) => c.id === wanted)?.label.name ?? String(wanted));
  return (
    <div className="grid gap-2 p-3 text-sm">
      <b>{t('overview.widgets.oneCorporation.title')}</b>
      <span className="text-text-dim">
        {wantedName === undefined
          ? t('overview.widgets.oneCorporation.hint', { title })
          : t('overview.widgets.oneCorporation.hintOther', { title, corporation: wantedName })}
      </span>
      {onUse && name !== undefined && (
        <span>
          <Button size="sm" onClick={onUse}>
            {t('overview.widgets.oneCorporation.use', { corporation: name })}
          </Button>
        </span>
      )}
    </div>
  );
}

function HeaderCharacterReadout({ characterId }: { characterId: number }) {
  const name = useRosterNames()?.get(characterId);
  if (name === undefined) return null;
  return <CharacterScopeReadout scope="one" characterId={characterId} characterName={name} />;
}

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

export function Widget(props: WidgetProps) {
  return props.previewView ? (
    <WidgetFrame {...props} view={props.previewView} />
  ) : (
    <LiveWidget {...props} />
  );
}

function LiveWidget(props: WidgetProps) {
  const { widget } = props;
  const board = useWidgetBoard();
  const scope = scopePresentation(
    widget.kind,
    readScope(board, widget),
    widget,
    board.id === 'corp'
  );
  const view = useWidgetView(widget.kind, scope.scopeAll, widget, scope.corporationId);
  return <WidgetFrame {...props} view={view} rememberHeight />;
}

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
  rememberHeight = false,
}: Omit<WidgetProps, 'previewView'> & {
  view: KindView;
  rememberHeight?: boolean;
}) {
  const { t } = useTranslation();
  const kind = getKind(widget.kind);
  const { refresh } = useOverviewRefresh();
  const edit = useOverviewEdit();
  const { setRowsPerPage } = edit;
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const now = useTicker(OVERVIEW_TICK_MS);
  const board = useWidgetBoard();
  const scope = scopePresentation(
    widget.kind,
    readScope(board, widget),
    widget,
    board.id === 'corp'
  );
  const ownCorporationId = useActiveCorporationId();
  const asksCorporation =
    scope.needsOneCorporation === true &&
    (scope.wantedCorporationId === undefined ||
      (ownCorporationId !== null && scope.wantedCorporationId !== ownCorporationId));
  const { state, showLastGood, reauthNote } = resolveWidget(view.status);
  const isPhone = useIsPhone();
  const navigate = useNavigate();
  const sizeKey = heightKey(widget, characterId, isPhone);
  const drawn = state === 'ok' || state === 'empty';
  const settling = rememberHeight && drawn && view.settling === true;
  const measureRef = useRememberHeight(sizeKey, rememberHeight && drawn && !settling);
  const reserved = () =>
    (rememberHeight ? rememberedBodyHeight(sizeKey) : undefined) ??
    estimatedBodyHeight(widget, isPhone);

  if (!kind) return null;
  const keys = widgetKeys(kind, widget.show);
  const title = widget.title ?? t(keys.titleKey);
  const endpoints = endpointsOf(widget.kind, widget);
  const grantTarget = view.grantCharacterId ?? characterId;
  const cardTo = menu !== undefined && !inertTitle && !editing ? view.to : null;
  const onCardClick = (event: MouseEvent<HTMLElement>) => {
    if (cardTo === null || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return;
    if (event.target.closest(CARD_CLICK_IGNORES) !== null) return;
    if (window.getSelection()?.toString()) return;
    navigate(cardTo);
  };

  const { setScope } = edit;
  let body;
  if (asksCorporation) {
    body = (
      <OneCorporationBody
        title={title}
        wanted={scope.wantedCorporationId}
        onUse={
          ownCorporationId === null ? null : () => setScope(widget.id, corpScope(ownCorporationId))
        }
      />
    );
  } else if (state === 'loading') {
    body = <Skeleton minHeight={reserved()} />;
  } else if (state === 'needsPermission') {
    body = (
      <div className="grid gap-2 p-3 text-sm">
        {grantTarget !== null && endpoints.length > 0 ? (
          <GrantBanner
            variant="ghost"
            characterId={grantTarget}
            characterName={view.grantCharacterName}
            endpoints={endpoints}
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
      <div className="grid gap-2 p-3 text-sm">
        <LiveStatus>{t('overview.widgets.failed.title')}</LiveStatus>
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
      <div className="grid gap-2 p-3 text-sm">
        <b>{view.emptyMessage ?? t(keys.emptyMessageKey)}</b>
        {!view.emptyHealthy && (
          <span className="text-text-dim">{view.emptyHint ?? t(kind.descKey)}</span>
        )}
        {view.to !== null && view.emptyLinkLabel !== undefined && (
          <Link to={view.to} className={entityLinkClassName('w-fit')}>
            {view.emptyLinkLabel}
          </Link>
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
          inert={inertTitle}
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

  if (reauthNote && grantTarget !== null && endpoints.length > 0) {
    body = (
      <>
        {body}
        <ReauthCachedNote className="px-3 pb-3" characterId={grantTarget} endpoints={endpoints} />
      </>
    );
  }

  if (state === 'ok' && view.grantEndpoints !== undefined && grantTarget !== null) {
    body = (
      <>
        {body}
        <div className="px-3 pb-3">
          <GrantBanner
            variant="ghost"
            characterId={grantTarget}
            characterName={view.grantCharacterName}
            endpoints={view.grantEndpoints}
          />
        </div>
      </>
    );
  }

  const card = (
    <section
      aria-label={title}
      aria-busy={state === 'loading'}
      onClick={cardTo === null ? undefined : onCardClick}
      className={cx(
        'flex h-full w-full min-w-0 flex-col rounded-xs border bg-panel',
        editing ? 'border-dashed border-line-bright' : 'border-line',
        cardTo !== null && 'cursor-pointer hover:border-line-bright'
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
          {view.headerMark && (state === 'ok' || state === 'empty') && (
            <GrantCellMark
              characterId={view.headerMark.characterId}
              characterName={view.headerMark.characterName}
              permission={view.headerMark.permission}
              why={view.headerMark.why}
              grantLabel={t('reauth.grantActionFor', { name: view.headerMark.characterName })}
              title={
                view.headerMark.count > 1
                  ? (permissions) =>
                      t('permissions.mark.severalTitle', {
                        count: view.headerMark!.count,
                        permissions,
                      })
                  : undefined
              }
            />
          )}
          {scope.chip &&
            !asksCorporation &&
            (scope.corporationId === undefined ? (
              <AllCharactersReadout compact={widget.size === 'S'} />
            ) : (
              <CorporationReadout
                corporationId={scope.corporationId}
                compact={widget.size === 'S'}
              />
            ))}
          <span className="flex-1" />
          {menu && (
            <RowMoreActions
              label={t('overview.widgets.settingsFor', { title })}
              focusTarget
              hints={false}
            />
          )}
        </div>
      )}
      <div className="flex-1" style={settling ? { minHeight: reserved() } : undefined}>
        <div ref={measureRef}>{body}</div>
      </div>
      {editControls}
      {scope.fallbackNote && !asksCorporation && state === 'ok' && characterId !== null && (
        <div className="border-t border-line px-3 py-1.5">
          <HeaderCharacterReadout characterId={characterId} />
        </div>
      )}
    </section>
  );
  return menu ? menu(card, view.to) : card;
}
