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
