/**
 * The Workbench tab's **Out-of-date fit** pieces (issue #2485): a row's
 * reasons, and the toggle that shows or hides out-of-date fits below the
 * current ones. The check itself is `workbenchFitCurrency.ts`.
 */
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@/components/ui';
import type { OutOfDateReason } from '@/engine/fittings/fitCurrency';
import type { WorkbenchFitList } from './workbenchFitCurrency';

/** Why a fit is out of date, one line; nothing for a current fit. */
export function OutOfDateReasons({ reasons }: { reasons: OutOfDateReason[] | undefined }) {
  const { t } = useTranslation();
  if (reasons === undefined) return null;
  const text = reasons
    .map((reason) => {
      switch (reason.kind) {
        case 'lost-slots':
          return t(`fittings.popular.workbench.outOfDate.lostSlots.${reason.rack}`);
        case 'unknown-hull':
          return t('fittings.popular.workbench.outOfDate.removedHull', { name: reason.name });
        case 'removed-item':
          return t('fittings.popular.workbench.outOfDate.removedItem', { name: reason.name });
      }
    })
    .join(' · ');
  return (
    <p className="text-xs text-warning">
      {t('fittings.popular.workbench.outOfDate.label', { reasons: text })}
    </p>
  );
}

/**
 * Below the list: the check's progress, then a toggle that shows or hides the
 * out-of-date fits, saying so when there are only those.
 */
export function OutOfDateToggle({
  list,
}: {
  list: Pick<
    WorkbenchFitList,
    'checking' | 'outOfDateCount' | 'allOutOfDate' | 'showOutOfDate' | 'setShowOutOfDate'
  >;
}) {
  const { t } = useTranslation();
  if (list.checking) {
    return (
      <Spinner size="sm" delayMs={200} label={t('fittings.popular.workbench.outOfDate.checking')} />
    );
  }
  if (list.outOfDateCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {list.allOutOfDate && (
        <p className="text-xs text-text-dim">
          {t('fittings.popular.workbench.outOfDate.allOutOfDate', { count: list.outOfDateCount })}
        </p>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={list.showOutOfDate}
        onClick={() => list.setShowOutOfDate(!list.showOutOfDate)}
      >
        {list.showOutOfDate
          ? t('fittings.popular.workbench.outOfDate.hide')
          : t('fittings.popular.workbench.outOfDate.show', { count: list.outOfDateCount })}
      </Button>
    </div>
  );
}
