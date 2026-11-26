import type { DataTableColumn } from '@/components/ui';
import { type ContactIdentity } from '@/features/character/contactsFilter';
import { ContactPortrait } from '@/features/character/ContactCells';

export function portraitColumn<T>(identity: (row: T) => ContactIdentity): DataTableColumn<T> {
  return {
    id: 'portrait',
    header: '',
    className: 'w-0 pr-0',
    stackEdge: 'start',
    render: (row) => <ContactPortrait contact={identity(row)} />,
  };
}
