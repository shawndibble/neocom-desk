/**
 * The Workbench tab's **Out-of-date fit** note (issue #2485). An out-of-date
 * fit is never listed; this says the check is running, then — when it hid
 * every fit — why the list is empty. The check itself is `workbenchHullRows.ts`.
 */
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import type { WorkbenchHullRows } from './workbenchHullRows';

/** Below the list: the check's progress, then a note when every fit is out of date. */
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
