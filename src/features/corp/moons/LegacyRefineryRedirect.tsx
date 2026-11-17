import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import { newestRefineryOnMoon } from '@/engine/corpTaxBook/refineryList';
import { Crumb } from './moonsParts';
import { refineriesTabPath, refineryPath } from './moonsPaths';
import { useBook } from './useBook';

/**
 * The retired moon page (`/corp/moons/moons/:moonId`) and moon owner refinery page open the
 * refinery page (#6348): the refinery itself, or the moon's newest refinery. A moon with no
 * Extraction in the book has no refinery to open.
 */
export function LegacyRefineryRedirect({
  structureId,
  moonId,
}: {
  structureId?: number;
  moonId?: number;
}) {
  const { t } = useTranslation();
  const { view } = useBook();
  const target =
    structureId ??
    (moonId === undefined ? undefined : newestRefineryOnMoon(view.extractions, moonId));
  if (target !== undefined) return <Navigate replace to={refineryPath(target)} />;
  return (
    <div className="space-y-4">
      <Crumb to={refineriesTabPath} label={t('corpTaxBook.moons.tabs.refineries')} />
      <EmptyState title={t('corpTaxBook.moons.refineryPage.notFound')} />
    </div>
  );
}
