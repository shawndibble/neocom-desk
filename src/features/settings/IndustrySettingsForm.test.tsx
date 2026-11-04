import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { useAssumedTe } from '@/features/industry/assumedTe';
import { useProfitBasis } from '@/features/industry/profitBasisSetting';
import { IndustrySettingsForm } from './IndustrySettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useAssumedMe.setState({ hydrated: false });
  useAssumedTe.setState({ hydrated: false });
  useProfitBasis.setState({ hydrated: false });
});

describe('IndustrySettingsForm', () => {
  it('shows every Industry setting by default', async () => {
    render(<IndustrySettingsForm />);

    expect(await screen.findByRole('spinbutton', { name: /Assumed ME/ })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Assumed TE/ })).toBeInTheDocument();
  });

  it('describes Assumed ME by its note', async () => {
    render(<IndustrySettingsForm />);

    expect(
      await screen.findByRole('spinbutton', { name: /Assumed ME/ })
    ).toHaveAccessibleDescription(/Quotes new plans and sub-builds at this ME/);
  });

  it('shows only assumed ME for Opportunities, the one input it prices with', async () => {
    render(<IndustrySettingsForm onlyAssumedMe />);

    expect(await screen.findByRole('spinbutton', { name: /Assumed ME/ })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /Assumed TE/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /blueprint cost/ })).not.toBeInTheDocument();
  });

  it('picks how owned materials are counted, defaulting to opportunity cost, and keeps the choice', async () => {
    render(<IndustrySettingsForm />);

    expect(await screen.findByRole('button', { name: 'Resale value' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Free' }));

    expect(screen.getByRole('button', { name: 'Free' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () =>
      expect((await db.settings.get('industryProfitBasis'))?.value).toBe('free')
    );
  });

  it('leaves the basis out of the Opportunities modal, which prices with assumed ME alone', async () => {
    render(<IndustrySettingsForm onlyAssumedMe />);

    await screen.findByRole('spinbutton', { name: /Assumed ME/ });
    expect(screen.queryByRole('button', { name: 'Free' })).not.toBeInTheDocument();
  });
});
