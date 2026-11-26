import type { TFunction } from 'i18next';
import type { OwnedStockBulkMessage } from '@/engine/industry/ownedStockBulkConfirmation';

export function ownedStockBulkText(t: TFunction, message: OwnedStockBulkMessage): string {
  switch (message.kind) {
    case 'useAllDone':
      return t('industry.useAllDone', { count: message.count });
    case 'useNoneDone':
      return t('industry.useNoneDone', { count: message.count });
    case 'useAllNothing':
      return t('industry.useAllNothing');
    case 'useNoneNothing':
      return t('industry.useNoneNothing');
  }
}
