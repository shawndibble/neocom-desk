import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { useAssumedTe } from '@/features/industry/assumedTe';
import { useIncludeBlueprintCost } from '@/features/industry/includeBlueprintCost';
import { IndustrySettingsForm } from './IndustrySettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useAssumedMe.setState({ hydrated: false });
  useAssumedTe.setState({ hydrated: false });
  useIncludeBlueprintCost.setState({ hydrated: false });
});

describe('IndustrySettingsForm', () => {
  it('shows every Industry setting by default', async () => {
    render(<IndustrySettingsForm />);

    expect(await screen.findByRole('spinbutton', { name: /Assumed ME/ })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Assumed TE/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /blueprint cost/ })).toBeInTheDocument();
  });

  it('describes Assumed ME by its note', async () => {
    render(<IndustrySettingsForm />);

    expect(
      await screen.findByRole('spinbutton', { name: /Assumed ME/ })
    ).toHaveAccessibleDescription(/quoted at this ME/);
  });

  it('shows only assumed ME for Opportunities, the one input it prices with', async () => {
    render(<IndustrySettingsForm onlyAssumedMe />);

    expect(await screen.findByRole('spinbutton', { name: /Assumed ME/ })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /Assumed TE/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /blueprint cost/ })).not.toBeInTheDocument();
  });
});
