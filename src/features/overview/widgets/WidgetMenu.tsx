/**
 * A widget's settings menu: the ⋮ in its header.
 *
 * View, Character and Range are radio groups (the current choice ticked), shown
 * only for what the kind has: a kind with one view has no View group, one
 * without a time window has no Range. Rename opens a small dialog after the
 * menu has closed (a text field inside a Radix menu loses keystrokes to its
 * typeahead, and docs/DESIGN.md §6c "Menu item that opens a dialog" fixes the
 * focus order). Esc, outside click and focus return come from the primitive.
 *
 * `inert` is the signed-out landing page's demo: the same menu over a layout
 * whose actions do nothing, where Rename must not open its dialog either.
 */
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Modal,
  TextInput,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { kindSumsAcrossCharacters } from './data/models';
import { boardKey, useWidgetBoard } from './board';
import { useOverviewEdit } from './editContext';
import { getKind } from './kinds';
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
  rangesOf,
  type CalendarEventsChoice,
  type Widget,
  type WidgetRange,
  type WidgetScope,
} from './layout';
import type { WidgetView } from './kinds';

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

export function WidgetMenu({ widget, inert = false }: { widget: Widget; inert?: boolean }) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const board = useWidgetBoard();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [renaming, setRenaming] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const kind = getKind(widget.kind);
  if (!kind) return null;

  const fallbackTitle = t(kind.titleKey);
  const title = widget.title ?? fallbackTitle;
  const canSum = kindSumsAcrossCharacters(widget.kind);
  const index = edit.layout.widgets.findIndex((w) => w.id === widget.id);
  const last = edit.layout.widgets.length - 1;

  return (
    <>
      {/* The demo scrolls the whole document, so a modal menu's scroll lock would hide the page scrollbar and shift the page. */}
      <DropdownMenu modal={!inert}>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="row"
            variant="plain"
            icon={<Icon.More />}
            label={t('overview.widgets.settingsFor', { title })}
            data-focus-target
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={onCloseAutoFocus}>
          {kind.views.length > 1 && (
            <>
              <DropdownMenuLabel>{t('overview.menu.view')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={widget.view}
                onValueChange={(next) => edit.setView(widget.id, next as WidgetView)}
              >
                {kind.views.map((view) => (
                  <DropdownMenuRadioItem key={view} value={view}>
                    {t(`overview.menu.views.${view}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}
          {/* Corp data belongs to one corporation: there is no Character to choose. */}
          {board.characterScope && (
            <>
              <DropdownMenuLabel>{t('overview.menu.character')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={widget.scope}
                onValueChange={(next) => edit.setScope(widget.id, next as WidgetScope)}
              >
                <DropdownMenuRadioItem value="header">
                  {t('overview.menu.header')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all" disabled={!canSum}>
                  {t('overview.menu.all')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {!canSum && (
                <p className="px-2 pb-1 text-xs text-text-dim">{t('overview.menu.nameOnly')}</p>
              )}
            </>
          )}
          {kind.hasRange && (
            <>
              {board.characterScope && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{t('overview.menu.range')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(widget.range)}
                onValueChange={(next) => edit.setRange(widget.id, Number(next) as WidgetRange)}
              >
                {rangesOf(widget.kind).map((days) => (
                  <DropdownMenuRadioItem key={days} value={String(days)}>
                    {days === 365
                      ? t('overview.menu.rangeYear')
                      : t('overview.menu.rangeDays', { days })}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          )}
          {kind.hasCalendarEvents && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('overview.menu.events')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={widget.calendarEvents ?? 'committed'}
                onValueChange={(next) =>
                  edit.setCalendarEvents(widget.id, next as CalendarEventsChoice)
                }
              >
                {CALENDAR_EVENTS_CHOICES.map((choice) => (
                  <DropdownMenuRadioItem key={choice} value={choice}>
                    {t(`overview.menu.eventsChoice.${choice}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          )}
          {kind.hasRaidsWhere && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('overview.menu.where')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={widget.raidsWhere ?? 'alliance'}
                onValueChange={(next) => edit.setRaidsWhere(widget.id, next as RaidsWhere)}
              >
                {RAIDS_WHERES.map((where) => (
                  <DropdownMenuRadioItem key={where} value={where}>
                    {t(`overview.menu.whereChoice.${where}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {widget.raidsWhere === 'near' && (
                <>
                  <DropdownMenuLabel>{t('overview.menu.radius')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={String(widget.raidsRadius ?? DEFAULT_RAIDS_RADIUS)}
                    onValueChange={(next) => edit.setRaidsRadius(widget.id, Number(next))}
                  >
                    {RAIDS_RADII.map((jumps) => (
                      <DropdownMenuRadioItem key={jumps} value={String(jumps)}>
                        {t('overview.menu.radiusJumps', { count: jumps })}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
            </>
          )}
          {kind.hasTrendSources && (
            <>
              <DropdownMenuSeparator />
              <TrendHubsMenuGroup widget={widget} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => run(() => (inert ? undefined : setPicking(true)))}>
                {t('overview.menu.trendItems')}
              </DropdownMenuItem>
            </>
          )}
          {kind.hasPlexPlan && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => run(() => (inert ? undefined : setPlanning(true)))}>
                {t('overview.menu.plexPlan')}
              </DropdownMenuItem>
            </>
          )}
          {/* The View group ends in its own separator; any group after it does not. */}
          {(board.characterScope ||
            kind.hasRange ||
            kind.hasCalendarEvents ||
            kind.hasRaidsWhere ||
            kind.hasTrendSources ||
            kind.hasPlexPlan) && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => run(() => (inert ? undefined : setRenaming(true)))}>
            {t('overview.menu.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={edit.layout.widgets.length >= MAX_WIDGETS}
            onSelect={() => edit.duplicate(widget.id)}
          >
            {t('overview.menu.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index <= 0} onSelect={() => edit.moveEdge(widget.id, 'top')}>
            {t('overview.menu.top')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index < 0 || index >= last}
            onSelect={() => edit.moveEdge(widget.id, 'bottom')}
          >
            {t('overview.menu.bottom')}
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked={widget.showOnPhone}
            onCheckedChange={(next) => edit.setShowOnPhone(widget.id, next === true)}
          >
            {t('overview.menu.phone')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger" onSelect={() => edit.remove(widget.id)}>
            {t(boardKey(board, 'menu.remove'))}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
