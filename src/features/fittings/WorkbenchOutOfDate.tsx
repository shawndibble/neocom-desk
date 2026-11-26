import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import type { WorkbenchHullRows } from './workbenchHullRows';

export function OutOfDateNote({
  list,
}: {
  list: Pick<WorkbenchHullRows, 'checking' | 'outOfDateCount' | 'allOutOfDate'>;
}) {
  const { t } = useTranslation();
  if (list.checking) {
    return (
      <Spinner size="sm" delayMs={200} label={t('fittings.popular.workbench.outOfDate.checking')} />
    );
  }
  if (!list.allOutOfDate) return null;
  return (
    <p className="text-xs text-text-dim">
      {t('fittings.popular.workbench.outOfDate.allOutOfDate', { count: list.outOfDateCount })}
    </p>
  );
}
