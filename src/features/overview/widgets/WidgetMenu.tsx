/**
 * A widget's settings menu: the right-click (touch-and-hold) menu over the
 * whole card, and the ⋮ in its header (a `RowMoreActions` inside the card),
 * both from one item list. Open the page comes first, where the kind has one.
 *
 * Show, View, Character and Range are radio groups (the current choice ticked),
 * shown only for what the kind has: a kind with one view has no View group, one
 * without a time window (or on a Show that reads none) has no Range. Rename
 * opens a small dialog after the menu has closed (a text field inside a Radix
 * menu loses keystrokes to its typeahead, and docs/DESIGN.md §6c "Menu item
 * that opens a dialog" fixes the focus order). Esc, outside click and focus
 * return come from the primitive.
 *
 * `inert` is the signed-out landing page's demo: the same menu over a layout
 * whose actions do nothing, where Rename must not open its dialog either.
 */
import { useId, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  MenuCheckboxItem,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  Modal,
  RowActionsMenu,
  TextInput,
  useOpenAfterMenu,
} from '@/components/ui';
import { kindSumsAcrossCharacters } from './data/models';
import { boardKey, useWidgetBoard } from './board';
import { useOverviewEdit } from './editContext';
import { getKind, rangeAppliesTo, showOf, widgetKeys } from './kinds';
import { TrendHubsMenuGroup, TrendItemsDialog } from './TrendPicks';
import { DEFAULT_PLEX_PER_30_DAYS } from '@/engine/omegaCoverage';
import {
  isPlexPlan,
  MAX_PLEX_PLAN,
  MAX_WIDGETS,
  CALENDAR_EVENTS_CHOICES,
  DEFAULT_RAIDS_RADIUS,
  RAIDS_RADII,
  RAIDS_WHERES,
  type RaidsWhere,
  LEGACY_PROFIT_SOURCE,
  PROFIT_SOURCES,
  type ProfitSource,
  rangesOf,
  type CalendarEventsChoice,
  type Widget,
  type WidgetRange,
  type WidgetScope,
} from './layout';
import type { WidgetShow, WidgetView } from './kinds';

function RenameDialog({
  widget,
  fallbackTitle,
  open,
  onClose,
}: {
  widget: Widget;
  fallbackTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { rename } = useOverviewEdit();
  const [draft, setDraft] = useState(widget.title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const labelId = useId();
  const currentTitle = widget.title ?? fallbackTitle;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('overview.menu.renameTitle', { title: currentTitle })}
      initialFocusRef={inputRef}
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          rename(widget.id, draft);
          onClose();
        }}
      >
        <label id={labelId} htmlFor={`${labelId}-field`} className="grid gap-1 text-xs">
          <span className="font-semibold">{t('overview.menu.renameLabel')}</span>
          <TextInput
            id={`${labelId}-field`}
            ref={inputRef}
            value={draft}
            maxLength={60}
            placeholder={fallbackTitle}
            aria-describedby={hintId}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <p id={hintId} className="text-xs text-text-dim">
          {t('overview.menu.renameHint', { title: fallbackTitle })}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('overview.menu.renameCancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('overview.menu.renameSave')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PlexPlanDialog({
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
  const { setPlexPer30Days } = useOverviewEdit();
  const [draft, setDraft] = useState(String(widget.plexPer30Days ?? DEFAULT_PLEX_PER_30_DAYS));
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const fieldId = useId();
  const value = Number(draft);
  const valid = draft.trim() !== '' && isPlexPlan(value);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('overview.menu.plexPlanTitle', { title })}
      initialFocusRef={inputRef}
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          setPlexPer30Days(widget.id, value);
          onClose();
        }}
      >
        <label htmlFor={fieldId} className="grid gap-1 text-xs">
          <span className="font-semibold">{t('overview.menu.plexPlanLabel')}</span>
          <TextInput
            id={fieldId}
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PLEX_PLAN}
            step={1}
            value={draft}
            aria-describedby={hintId}
            aria-invalid={!valid}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <p id={hintId} className="text-xs text-text-dim">
          {t('overview.menu.plexPlanHint')}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t('overview.menu.plexPlanCancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t('overview.menu.plexPlanSave')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function WidgetMenu({
  widget,
  to = null,
  inert = false,
  children,
}: {
  widget: Widget;
  /** The widget's page, when it has one: the first item opens it. */
  to?: string | null;
  inert?: boolean;
  /** The card: right-click or touch-and-hold anywhere on it opens the menu. */
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const edit = useOverviewEdit();
  const board = useWidgetBoard();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [renaming, setRenaming] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const kind = getKind(widget.kind);
  if (!kind) return children;

  const fallbackTitle = t(widgetKeys(kind, widget.show).titleKey);
  const title = widget.title ?? fallbackTitle;
  const hasRange = rangeAppliesTo(kind, widget.show);
  const canSum = kindSumsAcrossCharacters(widget.kind, widget);
  const index = edit.layout.widgets.findIndex((w) => w.id === widget.id);
  const last = edit.layout.widgets.length - 1;

  // The right-click menu and the header's ⋮ both draw this one list.
  const items = (
    <>
      {to !== null && !inert && (
        <>
          <MenuItem onSelect={() => navigate(to)}>
            {t('overview.menu.openPage', { title })}
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      {/* What the widget draws comes before how; every Show offers the kind's views, so View stays put. */}
      {kind.shows.length > 1 && (
        <>
          <MenuLabel>{t('overview.menu.show')}</MenuLabel>
          <MenuRadioGroup
            value={showOf(kind, widget.show)}
            onValueChange={(next) => edit.setShow(widget.id, next as WidgetShow)}
          >
            {kind.shows.map((show) => (
              <MenuRadioItem key={show} value={show}>
                {t(`overview.menu.showChoice.${show}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
        </>
      )}
      {kind.views.length > 1 && (
        <>
          <MenuLabel>{t('overview.menu.view')}</MenuLabel>
          <MenuRadioGroup
            value={widget.view}
            onValueChange={(next) => edit.setView(widget.id, next as WidgetView)}
          >
            {kind.views.map((view) => (
              <MenuRadioItem key={view} value={view}>
                {t(`overview.menu.views.${view}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
        </>
      )}
      {/* Corp data belongs to one corporation: there is no Character to choose. */}
      {board.characterScope && (
        <>
          <MenuLabel>{t('overview.menu.character')}</MenuLabel>
          <MenuRadioGroup
            value={widget.scope}
            onValueChange={(next) => edit.setScope(widget.id, next as WidgetScope)}
          >
            <MenuRadioItem value="header">{t('overview.menu.header')}</MenuRadioItem>
            <MenuRadioItem value="all" disabled={!canSum}>
              {t('overview.menu.all')}
            </MenuRadioItem>
          </MenuRadioGroup>
          {!canSum && (
            <p className="px-2 pb-1 text-xs text-text-dim">{t('overview.menu.nameOnly')}</p>
          )}
        </>
      )}
      {hasRange && (
        <>
          {board.characterScope && <MenuSeparator />}
          <MenuLabel>{t('overview.menu.range')}</MenuLabel>
          <MenuRadioGroup
            value={String(widget.range)}
            onValueChange={(next) => edit.setRange(widget.id, Number(next) as WidgetRange)}
          >
            {rangesOf(widget.kind).map((days) => (
              <MenuRadioItem key={days} value={String(days)}>
                {days === 365
                  ? t('overview.menu.rangeYear')
                  : t('overview.menu.rangeDays', { days })}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </>
      )}
      {kind.hasCalendarEvents && (
        <>
          <MenuSeparator />
          <MenuLabel>{t('overview.menu.events')}</MenuLabel>
          <MenuRadioGroup
            value={widget.calendarEvents ?? 'committed'}
            onValueChange={(next) =>
              edit.setCalendarEvents(widget.id, next as CalendarEventsChoice)
            }
          >
            {CALENDAR_EVENTS_CHOICES.map((choice) => (
              <MenuRadioItem key={choice} value={choice}>
                {t(`overview.menu.eventsChoice.${choice}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </>
      )}
      {kind.hasRaidsWhere && (
        <>
          <MenuSeparator />
          <MenuLabel>{t('overview.menu.where')}</MenuLabel>
          <MenuRadioGroup
            value={widget.raidsWhere ?? 'alliance'}
            onValueChange={(next) => edit.setRaidsWhere(widget.id, next as RaidsWhere)}
          >
            {RAIDS_WHERES.map((where) => (
              <MenuRadioItem key={where} value={where}>
                {t(`overview.menu.whereChoice.${where}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {widget.raidsWhere === 'near' && (
            <>
              <MenuLabel>{t('overview.menu.radius')}</MenuLabel>
              <MenuRadioGroup
                value={String(widget.raidsRadius ?? DEFAULT_RAIDS_RADIUS)}
                onValueChange={(next) => edit.setRaidsRadius(widget.id, Number(next))}
              >
                {RAIDS_RADII.map((jumps) => (
                  <MenuRadioItem key={jumps} value={String(jumps)}>
                    {t('overview.menu.radiusJumps', { count: jumps })}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </>
          )}
        </>
      )}
      {kind.hasProfitSource && (
        <>
          <MenuSeparator />
          <MenuLabel>{t('overview.menu.profitSource')}</MenuLabel>
          <MenuRadioGroup
            value={widget.profitSource ?? LEGACY_PROFIT_SOURCE}
            onValueChange={(next) => edit.setProfitSource(widget.id, next as ProfitSource)}
          >
            {PROFIT_SOURCES.map((source) => (
              <MenuRadioItem key={source} value={source}>
                {t(`overview.menu.profitSourceChoice.${source}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </>
      )}
      {kind.hasTrendSources && (
        <>
          <MenuSeparator />
          <TrendHubsMenuGroup widget={widget} />
          <MenuSeparator />
          <MenuItem onSelect={() => run(() => (inert ? undefined : setPicking(true)))}>
            {t('overview.menu.trendItems')}
          </MenuItem>
        </>
      )}
      {kind.hasPlexPlan && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={() => run(() => (inert ? undefined : setPlanning(true)))}>
            {t('overview.menu.plexPlan')}
          </MenuItem>
        </>
      )}
      {/* The View group ends in its own separator; any group after it does not. */}
      {(board.characterScope ||
        hasRange ||
        kind.hasCalendarEvents ||
        kind.hasRaidsWhere ||
        kind.hasProfitSource ||
        kind.hasTrendSources ||
        kind.hasPlexPlan) && <MenuSeparator />}
      <MenuItem onSelect={() => run(() => (inert ? undefined : setRenaming(true)))}>
        {t('overview.menu.rename')}
      </MenuItem>
      <MenuItem
        disabled={edit.layout.widgets.length >= MAX_WIDGETS}
        onSelect={() => edit.duplicate(widget.id)}
      >
        {t('overview.menu.duplicate')}
      </MenuItem>
      <MenuItem disabled={index <= 0} onSelect={() => edit.moveEdge(widget.id, 'top')}>
        {t('overview.menu.top')}
      </MenuItem>
      <MenuItem
        disabled={index < 0 || index >= last}
        onSelect={() => edit.moveEdge(widget.id, 'bottom')}
      >
        {t('overview.menu.bottom')}
      </MenuItem>
      <MenuCheckboxItem
        checked={widget.showOnPhone}
        onCheckedChange={(next) => edit.setShowOnPhone(widget.id, next === true)}
      >
        {t('overview.menu.phone')}
      </MenuCheckboxItem>
      <MenuSeparator />
      <MenuItem className="text-danger" onSelect={() => edit.remove(widget.id)}>
        {t(boardKey(board, 'menu.remove'))}
      </MenuItem>
    </>
  );

  return (
    <>
      {/* The demo scrolls the whole document, so a modal menu's scroll lock would hide the page scrollbar and shift the page. */}
      <RowActionsMenu
        name={title}
        items={items}
        onCloseAutoFocus={onCloseAutoFocus}
        modal={!inert}
        linksKeepBrowserMenu
      >
        {children}
      </RowActionsMenu>
      {picking && (
        <TrendItemsDialog
          // A fresh pick list each time the dialog opens.
          key={(widget.trendItems ?? []).join(',')}
          widget={widget}
          title={title}
          open
          onClose={() => setPicking(false)}
        />
      )}
      {planning && (
        <PlexPlanDialog widget={widget} title={title} open onClose={() => setPlanning(false)} />
      )}
      {renaming && (
        <RenameDialog
          // A fresh draft each time the dialog opens.
          key={widget.title ?? ''}
          widget={widget}
          fallbackTitle={fallbackTitle}
          open
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}
