/**
 * The "Fix CPU" / "Fix powergrid" / "Fix calibration" link under an
 * over-budget readout, opening Make it fit. Provided only by the editor, so
 * the same gauges on read-only surfaces (Compare, overlays) show no action.
 */
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';

import { MakeItFitContext, type FitResource } from './makeItFitContext';

export function MakeItFitTrigger({ resource }: { resource: FitResource }) {
  const { t } = useTranslation();
  const open = useContext(MakeItFitContext);
  if (!open) return null;
  return (
    <button type="button" className={textActionClassName()} onClick={() => open(resource)}>
      {t(`fittings.makeItFit.fix.${resource}`)}
    </button>
  );
}
