import type { TFunction } from 'i18next';
import { Button } from '@/components/ui';
import type { PayeeRecord } from '@/db';
import type { AttentionItem } from './AttentionStrip';

/**
 * One Tax-tab attention item for the Payees nobody in EVE answers to, left
 * after `useAutoLinkPayees` tried them: a Payee must be a real corporation or
 * character, and the fix is picking who it is in Manage Payees.
 */
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
