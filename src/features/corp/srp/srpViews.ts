import type { ComponentType } from 'react';
import { SrpOfficerView } from './SrpOfficerView';
import { SrpSettingsView } from './SrpSettingsView';

/**
 * The views of `/corp/srp`, in tab order (issue #4851, epic #4608). `SrpPage` shows one view
 * bare and several behind a tab bar, so the officer queue (#4853) and the member filing page
 * (#4852) join by adding an entry here, each with its own `visible` rule, and need no change to
 * the route or the page. Hidden, never locked: a view that is not `visible` is not listed.
 */
export interface SrpView {
  id: string;
  /** i18n key of the tab label. */
  labelKey: string;
  component: ComponentType;
  /** A table-wide view takes the wide page column; a form keeps the narrow one. */
  wide?: boolean;
  /** Who sees it, from what the page knows of the pilot's corp capabilities. */
  visible: (who: { canManageSrp: boolean }) => boolean;
}

export const SRP_VIEWS: readonly SrpView[] = [
  {
    id: 'queue',
    labelKey: 'srp.tabs.queue',
    component: SrpOfficerView,
    wide: true,
    // Director or Accountant (the page's own gate); the server re-checks the roles on every action.
    visible: ({ canManageSrp }) => canManageSrp,
  },
  {
    id: 'settings',
    labelKey: 'srp.tabs.settings',
    component: SrpSettingsView,
    // The view itself narrows to a Director (the server's verdict); an Accountant sees a line saying so.
    visible: ({ canManageSrp }) => canManageSrp,
  },
];
