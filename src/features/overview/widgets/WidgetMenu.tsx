/**
 * A widget's settings menu: the ⋮ in its header.
 *
 * View, Character and Range are radio groups (the current choice ticked), shown
 * only for what the kind has: a kind with one view has no View group, one
 * without a time window has no Range. Rename opens a small dialog after the
 * menu has closed (a text field inside a Radix menu loses keystrokes to its
 * typeahead, and docs/DESIGN.md §6c "Menu item that opens a dialog" fixes the
 * focus order). Esc, outside click and focus return come from the primitive.
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
import { useOverviewEdit } from './editContext';
import { getKind } from './kinds';
import { WIDGET_RANGES, type Widget, type WidgetRange, type WidgetScope } from './layout';
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

export function WidgetMenu({ widget }: { widget: Widget }) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [renaming, setRenaming] = useState(false);
  const kind = getKind(widget.kind);
  if (!kind) return null;

  const fallbackTitle = t(kind.titleKey);
  const title = widget.title ?? fallbackTitle;
  const canSum = kindSumsAcrossCharacters(widget.kind);
  const index = edit.layout.widgets.findIndex((w) => w.id === widget.id);
  const last = edit.layout.widgets.length - 1;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
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
          {kind.hasRange && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('overview.menu.range')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(widget.range)}
                onValueChange={(next) => edit.setRange(widget.id, Number(next) as WidgetRange)}
              >
                {WIDGET_RANGES.map((days) => (
                  <DropdownMenuRadioItem key={days} value={String(days)}>
                    {t('overview.menu.rangeDays', { days })}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run(() => setRenaming(true))}>
            {t('overview.menu.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => edit.duplicate(widget.id)}>
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
            {t('overview.menu.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
