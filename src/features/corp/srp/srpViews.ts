import type { ComponentType } from 'react';
import { MemberSrpView } from './MemberSrpView';
import { SrpSettingsView } from './SrpSettingsView';
import type { SrpTabId } from './srpTabs';

/**
 * The views of `/corp/srp`, in tab order (issues #4851, #4852; epic #4608). One page, role-aware:
 * `SrpPage` shows one visible view bare and several behind a tab bar. The officer queue (#4853)
 * joins by adding a tab to `srpTabs.ts` and an entry here with its own `visible` rule, and needs
 * no change to the route or the page. Hidden, never locked: a view that is not `visible` is not listed.
 */
export interface SrpView {
  /** Doubles as the tab id and URL segment (`srpTabs.ts`). */
  id: SrpTabId;
  component: ComponentType;
  /** Who sees it. `srpOn`: the pilot's corporation has SRP on (`useSrpNavVisible`). */
  visible: (who: { canManageSrp: boolean; srpOn: boolean }) => boolean;
}

export const SRP_VIEWS: readonly SrpView[] = [
  {
    id: 'claims',
    component: MemberSrpView,
    // Anyone in an SRP corp, no Corp Access needed. Where SRP is off, an officer goes straight to
    // Settings to turn it on; anyone else keeps this view, which says SRP is not set up.
    visible: ({ canManageSrp, srpOn }) => srpOn || !canManageSrp,
  },
  {
    id: 'settings',
    component: SrpSettingsView,
    // The view itself narrows to a Director (the server's verdict); an Accountant sees a line saying so.
    visible: ({ canManageSrp }) => canManageSrp,
  },
];
