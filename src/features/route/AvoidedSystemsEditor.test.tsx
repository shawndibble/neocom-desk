import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import { db } from '@/db';
import { AvoidedSystemsEditor } from './TravelRuleFields';
import { useAvoidedSystems } from './avoidedSystems';

beforeEach(async () => {
  await db.settings.clear();
  useAvoidedSystems.setState({ value: [], hydrated: false });
});

describe('AvoidedSystemsEditor', () => {
  it('hands focus to a neighbouring Remove, then the Add trigger, as systems go (issue #3365)', async () => {
    await useAvoidedSystems.getState().setValue([1, 2]);
    render(<AvoidedSystemsEditor />);
    // Unnamed (no snapshot) systems list as #id, sorted: #1 then #2.
    fireEvent.click(await screen.findByRole('button', { name: /Remove .*#1/ }));
    const last = await screen.findByRole('button', { name: /Remove .*#2/ });
    await waitFor(() => expect(document.activeElement).toBe(last));
    fireEvent.click(last);
    const add = await screen.findByRole('button', { name: /add/i });
    await waitFor(() => expect(document.activeElement).toBe(add));
  });
});
