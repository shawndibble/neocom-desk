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
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useOverviewEdit } from './editContext';
import { MAX_WIDGETS } from './layout';

export function CustomizeBar({ onAdd, onRoles }: { onAdd: () => void; onRoles: () => void }) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  // Focus follows the swap: onto Keep when the question appears, back onto Reset when dismissed.
  const returnToReset = useRef(false);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (returnToReset.current) {
      returnToReset.current = false;
      resetRef.current?.focus();
    }
  }, [confirming]);

  return (
    <div
      data-customize-bar
      role="region"
      aria-label={t('overview.customize.barLabel')}
      className="flex flex-wrap items-center gap-2 rounded-xs border border-dashed border-line-bright bg-panel px-3 py-2"
    >
      <b className="text-sm">{t('overview.customize.title')}</b>
      <span className="text-xs text-text-dim">
        {t('overview.customize.count', { count: edit.layout.widgets.length, max: MAX_WIDGETS })}
      </span>
      <span className="flex-1" />
      {confirming ? (
        <>
          <span className="text-sm" id="overview-reset-ask">
            {t('overview.customize.resetAsk')}
          </span>
          <Button
            variant="danger"
            aria-describedby="overview-reset-ask"
            onClick={() => {
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
          <Button variant="primary" onClick={onAdd} data-focus-target>
            <Icon.AddWidget size={Icon.ICON_SIZE.md} aria-hidden="true" />
            {t('overview.customize.add')}
          </Button>
          <Button onClick={onRoles}>{t('overview.customize.roles')}</Button>
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
