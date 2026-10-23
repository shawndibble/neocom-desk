import type { ComponentType } from 'react';
import { SrpOfficerView } from './SrpOfficerView';
import { SrpSettingsView } from './SrpSettingsView';
import type { SrpTabId } from './srpTabs';

/**
 * The officer views of `/corp/srp`, in tab order (issues #4851-#4853; epic #4608).
 * `SrpPage` shows one visible view bare and several behind a tab bar. A view is a tab in
 * `srpTabs.ts` plus an entry here with its own `visible` rule. Hidden, never locked: a view that
 * is not `visible` is not listed.
 */
export interface SrpView {
  /** Doubles as the tab id and URL segment (`srpTabs.ts`). */
  id: SrpTabId;
  component: ComponentType;
  /** A table-wide view takes the wide page column; a form keeps the narrow one. */
  wide?: boolean;
  /** Who sees it. `srpOn`: the pilot's corporation has SRP on (`useSrpNavVisible`). */
  visible: (who: { canManageSrp: boolean; srpOn: boolean }) => boolean;
}

export const SRP_VIEWS: readonly SrpView[] = [
  {
    id: 'queue',
    component: SrpOfficerView,
    wide: true,
    // Director or Accountant (the page's own gate) in an SRP corp; the server re-checks the roles
    // on every action. Where SRP is off, an officer goes straight to Settings to turn it on.
    visible: ({ canManageSrp, srpOn }) => canManageSrp && srpOn,
  },
  {
    id: 'settings',
    component: SrpSettingsView,
    // The view itself narrows to a Director (the server's verdict); an Accountant sees a line saying so.
    visible: ({ canManageSrp }) => canManageSrp,
  },
];
