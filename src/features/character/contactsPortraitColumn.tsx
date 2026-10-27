import type { DataTableColumn } from '@/components/ui';
import { type ContactIdentity } from '@/features/character/contactsFilter';
import { ContactPortrait } from '@/features/character/ContactCells';

/** The portrait column both tables lead with: no header, never sorted, never hidden. */
export function portraitColumn<T>(identity: (row: T) => ContactIdentity): DataTableColumn<T> {
  return {
    id: 'portrait',
    header: '',
    className: 'w-0 pr-0',
    stackEdge: 'start',
    render: (row) => <ContactPortrait contact={identity(row)} />,
  };
}
