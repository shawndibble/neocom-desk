import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { ShipsTabBar } from '@/features/fittings/ShipsTabBar';
import { SHIPS_TABS } from '@/features/fittings/shipsTabs';
import { ShipTreeTab } from '@/features/fittings/shipTree/ShipTreeTab';
import { usePageTab } from '@/lib/usePageTab';
import { Fittings } from './Fittings';

/**
 * The Ships section (scope decision `20260926-135538`): the Fittings tab and
 * the Ship Tree tab. The Fittings tab and the editor below it
 * (`/ships/fittings/edit`) render the same `<Fittings />` in the same place,
 * so opening a Fitting keeps one mounted instance, as it did when both were
 * `/fittings` (`shipsTabs.ts`). `Fittings` draws the page header and tab bar
 * itself, on its Start screen only — an open Fitting shows neither.
 */
export function Ships() {
  const { t } = useTranslation();
  const [tab] = usePageTab(SHIPS_TABS);
  if (tab !== 'tree') return <Fittings />;
  return (
    <div className="space-y-3">
      <PageHeader title={t('nav.ships')} />
      <ShipsTabBar />
      <ShipTreeTab />
    </div>
  );
}
