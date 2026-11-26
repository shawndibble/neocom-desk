import type { TFunction } from 'i18next';
import { Button } from '@/components/ui';
import type { PayeeRecord } from '@/db';
import type { AttentionItem } from './AttentionStrip';

export function unlinkedPayeesItem(
  unlinked: readonly PayeeRecord[],
  t: TFunction,
  openPayeeManager: () => void
): AttentionItem | null {
  if (unlinked.length === 0) return null;
  return {
    id: 'unlinked-payees',
    tone: 'warning',
    title: t('miningTax.attention.unlinkedPayees', { count: unlinked.length }),
    detail: (
      <p>
        {t('miningTax.attention.unlinkedPayeesDetail', {
          names: unlinked.map((p) => p.name).join(', '),
        })}
      </p>
    ),
    action: (
      <Button size="sm" onClick={openPayeeManager}>
        {t('miningTax.attention.unlinkedPayeesAction')}
      </Button>
    ),
  };
}
