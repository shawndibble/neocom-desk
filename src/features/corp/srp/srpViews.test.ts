import { describe, expect, it } from 'vitest';
import { SRP_TABS } from './srpTabs';
import { SRP_VIEWS } from './srpViews';

const idsFor = (who: { canManageSrp: boolean; srpOn: boolean }) =>
  SRP_VIEWS.filter((view) => view.visible(who)).map((view) => view.id);

describe('SRP_VIEWS (officer /corp/srp)', () => {
  it('has a tab for every view, and no player view', () => {
    expect(SRP_TABS.tabs.map((tab) => tab.id)).toEqual(['queue', 'settings']);
    expect(SRP_VIEWS.map((view) => view.id)).toEqual(['queue', 'settings']);
  });

  it('shows an officer the Queue and Settings, or Settings alone where SRP is off', () => {
    expect(idsFor({ canManageSrp: true, srpOn: true })).toEqual(['queue', 'settings']);
    expect(idsFor({ canManageSrp: true, srpOn: false })).toEqual(['settings']);
  });

  it('shows a pilot who is no officer nothing', () => {
    expect(idsFor({ canManageSrp: false, srpOn: true })).toEqual([]);
    expect(idsFor({ canManageSrp: false, srpOn: false })).toEqual([]);
  });
});
