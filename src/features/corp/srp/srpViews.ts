import type { ComponentType } from 'react';
import { SrpOfficerView } from './SrpOfficerView';
import { SrpSettingsView } from './SrpSettingsView';
import type { SrpTabId } from './srpTabs';

export interface SrpView {
  id: SrpTabId;
  component: ComponentType;
  visible: (who: { canManageSrp: boolean; srpOn: boolean; isDirector: boolean }) => boolean;
}

export const SRP_VIEWS: readonly SrpView[] = [
  {
    id: 'queue',
    component: SrpOfficerView,
    visible: ({ canManageSrp, srpOn }) => canManageSrp && srpOn,
  },
  {
    id: 'settings',
    component: SrpSettingsView,
    visible: ({ canManageSrp, srpOn, isDirector }) => canManageSrp && (isDirector || !srpOn),
  },
];
