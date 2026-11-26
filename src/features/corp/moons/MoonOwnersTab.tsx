import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@/components/ui';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { useBook } from './useBook';
import { moonOwnerPath } from './moonsPaths';
import { PayMoonOwnerHost } from './PayMoonOwnerHost';
import { MoonOwnersTable } from './MoonOwnersTable';
import { useMoonOwners } from './useMoonOwners';
import { usePopShareMarks } from './usePopShareMarks';

export function MoonOwnersTab({ onInvite }: { onInvite?: () => void }) {
  const { t } = useTranslation();
  const { names, canEdit } = useBook();
  const [paying, setPaying] = useState<number | null>(null);
  const { input, rows, totals } = useMoonOwners();
  const navigate = useNavigate();
  const shareMarks = usePopShareMarks();
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('corpTaxBook.moons.moonOwners.empty.title')}
        hint={t('corpTaxBook.moons.moonOwners.empty.hint')}
        {...(canEdit && onInvite
          ? {
              action: (
                <Button variant="ghost" onClick={onInvite}>
                  {t('corpTaxBook.moons.moonOwners.invite')}
                </Button>
              ),
            }
          : {})}
      />
    );
  }
  return (
    <>
      <MoonOwnersTable
        rows={rows}
        totals={totals}
        name={names.corporation}
        now={Date.parse(input.now)}
        {...(shareMarks ? { shareMarks: shareMarks.owners } : {})}
        onOpen={(row) => navigate(moonOwnerPath(row.id))}
        {...(canEdit ? { onPay: (row: MoonOwnerRow) => setPaying(row.corporationId) } : {})}
      />
      {paying !== null && (
        <PayMoonOwnerHost corporationId={paying} onClose={() => setPaying(null)} />
      )}
    </>
  );
}
