/**
 * The "Make it fit…" action beside an over-budget CPU/PG/calibration readout.
 * Provided only by the editor, so the same gauges on read-only surfaces
 * (Compare, overlays) show no action.
 */
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';

import { MakeItFitContext } from './makeItFitContext';

export function MakeItFitTrigger() {
  const { t } = useTranslation();
  const open = useContext(MakeItFitContext);
  if (!open) return null;
  return (
    <button type="button" className={textActionClassName()} onClick={open}>
      {t('fittings.makeItFit.trigger')}
    </button>
  );
}
