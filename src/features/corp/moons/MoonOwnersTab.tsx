import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import { useBook } from './useBook';
import { moonOwnerPath } from './moonsPaths';
import { MoonOwnersTable } from './MoonOwnersTable';
import { useMoonOwners } from './useMoonOwners';

/** The Moon owners tab of `/corp/moons`: the book's moon owners, from the book's own data. */
export function MoonOwnersTab() {
  const { t } = useTranslation();
  const { names } = useBook();
  const { input, rows, totals } = useMoonOwners();
  const navigate = useNavigate();
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('corpTaxBook.moons.moonOwners.empty.title')}
        hint={t('corpTaxBook.moons.moonOwners.empty.hint')}
      />
    );
  }
  return (
    <MoonOwnersTable
      rows={rows}
      totals={totals}
      name={names.corporation}
      now={Date.parse(input.now)}
      onOpen={(row) => navigate(moonOwnerPath(row.id))}
    />
  );
}
