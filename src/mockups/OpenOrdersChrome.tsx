import type { ReactNode } from 'react';
import { DataAgeBadge, IconButton, PageHeader, Tabs, useTabsId } from '@/components/ui';
import * as Icon from '@/components/ui/icons';

/** Fixed "fetched" time, so every screenshot reads the same age. */
const FETCHED_AT = new Date(Date.now() - 2 * 60_000);

/**
 * Today's Market header and section tabs, shared by every Open Orders form so
 * the screenshots differ only in the proposal. `actions` adds a form's own
 * header controls before Refresh and Export.
 */
export function OpenOrdersChrome({ actions }: { actions?: ReactNode }) {
  const tabsId = useTabsId();
  return (
    <>
      <PageHeader
        title="Market"
        meta={<DataAgeBadge date={FETCHED_AT} />}
        actions={
          <>
            {actions}
            <IconButton icon={<Icon.Refresh />} label="Refresh orders" />
            <IconButton icon={<Icon.Export />} label="Export orders" />
          </>
        }
      />
      <Tabs
        tabsId={tabsId}
        label="Market views"
        value="orders"
        onChange={() => {}}
        tabs={[
          { id: 'browser', label: 'Market' },
          { id: 'orders', label: 'Open' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'appraisal', label: 'Appraisal' },
        ]}
      />
    </>
  );
}
