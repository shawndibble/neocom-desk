/**
 * One tile on the Overview: a header (title, New tag, character scope chip, an
 * Open link, a settings button) over a body that is one of the five Widget
 * States.
 *
 * The body is a Number or a List, and **the headline number is always on
 * screen**: the List view carries it as a line above its rows, and a Chart
 * view (not built yet) falls back to the Number. Every state is drawn for real
 * rather than collapsing to blank: a widget that vanishes when it has nothing
 * to say cannot be told from one that failed to load.
 *
 * No view-cyclers in the header: view switching lives in the settings menu
 * (next stage), so a stray click changes nothing.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import {
  Button,
  IconButton,
  IskAmount,
  RowCaret,
  SEVERITY_TEXT,
  SeverityIcon,
  entityLinkClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { GrantBanner } from '@/app/GrantNote';
import { cx } from '@/lib/cx';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { boardRowLinkClassName } from '../boardRowLink';
import { useOverviewRefresh } from './data/refreshContext';
import type { KindView, ListRow, NumberModel } from './data/types';
import { useWidgetView } from './data/useWidgetView';
import { getKind } from './kinds';
import type { Widget as WidgetModel } from './layout';
import { scopePresentation } from './scope';
import { resolveWidget } from './state';
import { rowsForSize } from './sizes';

export interface WidgetProps {
  widget: WidgetModel;
  /** Draw the New tag on kinds that are new: only for a pilot who had the old board. */
  showNew: boolean;
  /** The header switcher is on All characters. */
  headerAll: boolean;
  /** The pilot is customizing: a dashed edge, the rest is the next stage's. */
  editing?: boolean;
  /** Opens the widget's settings menu; wired in the next stage. */
  onOpenSettings?: (id: string) => void;
  /** The empty state's Remove widget. */
  onRemove: (id: string) => void;
}

const TICK_MS = 30_000;

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
      {model.note && <p className="text-[0.8125rem] text-text-dim">{model.note}</p>}
    </div>
  );
}

function RowBody({ row }: { row: ListRow }) {
  const value = (
    <span
      className={cx(
        'shrink-0 text-[0.8125rem] font-semibold whitespace-nowrap tabular-nums',
        SEVERITY_TEXT[row.tone] === SEVERITY_TEXT.clear ? 'text-text' : SEVERITY_TEXT[row.tone]
      )}
    >
      {row.iskAmount === undefined ? row.value : <IskAmount value={row.iskAmount} decimals={0} />}
    </span>
  );
  const text = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[0.8125rem] font-semibold">{row.title}</span>
      {row.detail && <span className="block truncate text-xs text-text-dim">{row.detail}</span>}
    </span>
  );
  if (row.to === undefined) {
    return (
      <li className="flex items-center justify-between gap-2.5 border-b border-line px-3 py-1.5 last:border-b-0">
        {text}
        {value}
      </li>
    );
  }
  return (
    <li className="border-b border-line last:border-b-0">
      <RowTappableContext.Provider value>
        <Link to={row.to} className={boardRowLinkClassName}>
          {text}
          {value}
          <RowCaret />
        </Link>
      </RowTappableContext.Provider>
    </li>
  );
}

function ListBody({ view, size }: { view: KindView; size: WidgetModel['size'] }) {
  const { t } = useTranslation();
  const shown = view.rows.slice(0, rowsForSize[size]);
  const more = view.rows.length - shown.length;
  return (
    <div>
      {/* The headline stays on screen in every view. */}
      <NumberBody model={{ ...view.number, note: undefined }} />
      {shown.length > 0 && (
        <ul className="border-t border-line">
          {shown.map((row) => (
            <RowBody key={row.key} row={row} />
          ))}
          {more > 0 && (
            <li className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
              {t('overview.widgets.moreRows', { count: more })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The fixed scope readout (DESIGN §6c): this widget reads every Character on the device. */
function AllCharactersReadout() {
  const total = useLiveQuery(() => db.characters.count(), []);
  if (!total) return null;
  return <CharacterScopeReadout scope="all" total={total} />;
}

/** The same readout in its "Name only" form: All was asked for, but this kind reads one Character. */
function HeaderCharacterReadout({ characterId }: { characterId: number }) {
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  if (!character) return null;
  return (
    <CharacterScopeReadout scope="one" characterId={characterId} characterName={character.name} />
  );
}

function Skeleton() {
  const { t } = useTranslation();
  const bar = 'block animate-pulse rounded-xs bg-line motion-reduce:animate-none';
  return (
    <div className="grid gap-2 px-3 py-3">
      <span aria-hidden="true" className={cx(bar, 'h-6 w-[45%]')} />
      <span aria-hidden="true" className={cx(bar, 'h-3 w-[70%]')} />
      <span className="sr-only">{t('overview.widgets.loading')}</span>
    </div>
  );
}

export function Widget({
  widget,
  showNew,
  headerAll,
  editing = false,
  onOpenSettings,
  onRemove,
}: WidgetProps) {
  const { t } = useTranslation();
  const kind = getKind(widget.kind);
  const { refresh } = useOverviewRefresh();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const now = useTicker(TICK_MS);
  const scope = scopePresentation(widget.kind, widget.scope, headerAll);
  const view = useWidgetView(widget.kind, scope.scopeAll);
  const { state, showLastGood } = resolveWidget(view.status);

  // The grid only draws kinds it knows; a widget rendered alone without one has no title to show.
  if (!kind) return null;
  const title = widget.title ?? t(kind.titleKey);

  let body;
  if (state === 'loading') {
    body = <Skeleton />;
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
        {showLastGood && <NumberBody model={view.number} dimmed />}
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
        <span className="text-text-dim">{t('overview.widgets.emptyHint')}</span>
        <span>
          <Button size="sm" onClick={() => onRemove(widget.id)}>
            {t('overview.widgets.remove')}
          </Button>
        </span>
      </div>
    );
  } else {
    body =
      widget.view === 'list' ? (
        <ListBody view={view} size={widget.size} />
      ) : (
        // Number, and Chart until charts land: the headline is the one thing every view shows.
        <NumberBody model={view.number} />
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
      <div className="flex min-h-11 items-center gap-1.5 border-b border-line py-1 pr-1.5 pl-2.5 md:min-h-9">
        <h2 className="min-w-0 truncate text-[0.6875rem] font-semibold tracking-widest text-text uppercase">
          {title}
        </h2>
        {showNew && kind.isNew && (
          <span className="rounded-xs bg-accent px-1.5 text-[0.5625rem] font-bold tracking-widest text-accent-contrast uppercase">
            {t('overview.widgets.new')}
          </span>
        )}
        {scope.chip && <AllCharactersReadout />}
        <span className="flex-1" />
        {view.to !== null && (
          <Link
            to={view.to}
            aria-label={t('overview.widgets.openPage', { title })}
            className={entityLinkClassName(
              'flex min-h-11 items-center gap-0.5 text-xs font-semibold whitespace-nowrap md:min-h-0'
            )}
          >
            {t('overview.board.open')}
            <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          </Link>
        )}
        <IconButton
          size="sm"
          variant="plain"
          icon={<Icon.More />}
          label={t('overview.widgets.settingsFor', { title })}
          disabled={onOpenSettings === undefined}
          onClick={() => onOpenSettings?.(widget.id)}
        />
      </div>
      <div className="flex-1">{body}</div>
      {scope.fallbackNote && state === 'ok' && characterId !== null && (
        <div className="border-t border-line px-3 py-1.5">
          <HeaderCharacterReadout characterId={characterId} />
        </div>
      )}
    </section>
  );
}
