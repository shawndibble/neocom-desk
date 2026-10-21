/**
 * The bar above the grid while the Overview is being customized: how many of
 * the 30 widgets are used, the ways to add (Add widget, Start from a role),
 * Reset behind an inline "Reset the layout?" question, and Cancel / Done.
 *
 * Cancel puts back the layout as it was when Customize began; Done keeps it.
 * Reset is an Undo-able change, so its confirmation is one inline question
 * rather than a dialog: asking twice (a dialog, then a toast) for a change that
 * can be undone would be heavier than the change.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { boardKey, useWidgetBoard } from './board';
import { useOverviewEdit } from './editContext';
import { MAX_WIDGETS } from './layout';

export function CustomizeBar({
  onAdd,
  onRoles,
}: {
  onAdd: () => void;
  /** Start from a role; absent on a board with no roles (the Corp overview). */
  onRoles?: () => void;
}) {
  const { t } = useTranslation();
  const board = useWidgetBoard();
  const edit = useOverviewEdit();
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const askId = useId();
  // Focus follows the swap: onto Keep when the question appears, back onto Reset when dismissed.
  const returnToReset = useRef(false);
  // After a confirmed Reset the widgets are replaced, so the pilot is put back on Add widget.
  const returnToAdd = useRef(false);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (returnToReset.current) {
      returnToReset.current = false;
      resetRef.current?.focus();
    } else if (returnToAdd.current) {
      returnToAdd.current = false;
      addRef.current?.focus();
    }
  }, [confirming]);

  return (
    <div
      data-customize-bar
      role="region"
      aria-label={t(boardKey(board, 'customize.barLabel'))}
      className="flex flex-wrap items-center gap-2 rounded-xs border border-dashed border-line-bright bg-panel px-3 py-2"
    >
      <b className="text-sm">{t('overview.customize.title')}</b>
      <span className="text-xs text-text-dim">
        {t('overview.customize.count', { count: edit.layout.widgets.length, max: MAX_WIDGETS })}
      </span>
      <span className="flex-1" />
      {confirming ? (
        <>
          <span className="text-sm" id={askId}>
            {t('overview.customize.resetAsk')}
          </span>
          <Button
            variant="danger"
            aria-describedby={askId}
            onClick={() => {
              returnToAdd.current = true;
              setConfirming(false);
              edit.reset();
            }}
          >
            {t('overview.customize.resetConfirm')}
          </Button>
          <Button
            ref={keepRef}
            onClick={() => {
              returnToReset.current = true;
              setConfirming(false);
            }}
          >
            {t('overview.customize.resetKeep')}
          </Button>
        </>
      ) : (
        <>
          <Button ref={addRef} variant="primary" onClick={onAdd} data-focus-target>
            <Icon.AddWidget size={Icon.ICON_SIZE.md} aria-hidden="true" />
            {t('overview.customize.add')}
          </Button>
          {onRoles && <Button onClick={onRoles}>{t('overview.customize.roles')}</Button>}
          <Button ref={resetRef} onClick={() => setConfirming(true)}>
            {t('overview.customize.reset')}
          </Button>
          <Button onClick={edit.cancel}>{t('overview.customize.cancel')}</Button>
          <Button variant="primary" onClick={edit.done}>
            {t('overview.customize.done')}
          </Button>
        </>
      )}
    </div>
  );
}
