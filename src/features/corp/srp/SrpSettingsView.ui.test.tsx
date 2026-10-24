import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';

const hook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  selectTab: vi.fn(),
}));
vi.mock('./useSrpSettings', () => ({ useSrpSettings: () => hook.value }));
vi.mock('@/lib/usePageTab', () => ({ usePageTab: () => ['settings', hook.selectTab] }));
vi.mock('./SrpSettingsEditor', () => ({
  SrpSettingsEditor: ({ onSave }: { onSave: (p: object, e: null) => Promise<void> }) => (
    <button onClick={() => void onSave({ windowDays: 45 }, null)}>stub save</button>
  ),
}));

import { SrpSettingsView } from './SrpSettingsView';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SrpSettingsView', () => {
  it('toasts Saved after a successful save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    hook.value = {
      state: { status: 'ready', settings: { updatedAt: 1 }, verdict: {} },
      save,
      characterId: 7,
    };
    render(<SrpSettingsView />);
    await userEvent.click(screen.getByRole('button', { name: 'stub save' }));
    expect(save).toHaveBeenCalledWith({ windowDays: 45 }, null);
    expect((await screen.findAllByText('Saved')).length).toBeGreaterThan(0);
  });

  it('selects the Settings tab, then turns SRP on', async () => {
    const order: string[] = [];
    hook.selectTab.mockImplementation(() => order.push('tab'));
    hook.value = {
      state: { status: 'never-on' },
      turnOn: vi.fn(async () => void order.push('on')),
    };
    render(<SrpSettingsView />);
    await userEvent.click(screen.getByRole('button', { name: /turn on/i }));
    expect(hook.selectTab).toHaveBeenCalledWith('settings');
    expect(order).toEqual(['tab', 'on']);
  });
});
