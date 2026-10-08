import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PlanList } from './PlanList';
import type { SkillPlanRecord } from '@/db';

function plan(id: string, name: string): SkillPlanRecord {
  return {
    id,
    name,
    entries: [],
    remapCount: 0,
    updatedAt: new Date().toISOString(),
  } as unknown as SkillPlanRecord;
}

const noop = () => {};
const planHref = (id: string) => `/skills/plans/${id}`;
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

describe('PlanList delete confirmation (#408: names the plan)', () => {
  it('names the plan being deleted in the confirmation modal', async () => {
    render(
      <PlanList
        plans={[plan('1', 'Titan pilot')]}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Titan pilot' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    expect(screen.getByText(/delete "titan pilot"/i)).toBeInTheDocument();
  });

  it('deletes the plan whose row triggered the confirmation, even with multiple plans', async () => {
    const onDelete = vi.fn();
    render(
      <PlanList
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={onDelete}
        onRename={noop}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Beta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    expect(screen.getByText(/delete "beta"/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('2');
  });
});

describe('PlanList row stats (#1416)', () => {
  const props = {
    planHref,
    onDuplicate: noop,
    onDelete: noop,
    onRename: noop,
  };

  it('shows duration and finish under the name, and "Nothing to train" for an empty plan', () => {
    render(
      <PlanList
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        {...props}
        stats={
          new Map([
            ['1', { totalSeconds: 86_400, finish: new Date(2026, 0, 2) }],
            ['2', { totalSeconds: 0, finish: null }],
          ])
        }
      />
    );
    expect(screen.getByText(/1d.*· finishes/)).toBeInTheDocument();
    expect(screen.getByText('Nothing to train')).toBeInTheDocument();
  });

  it('renders the name only without stats', () => {
    render(<PlanList plans={[plan('1', 'Alpha')]} {...props} />);
    expect(screen.queryByText(/finishes|Nothing to train/)).not.toBeInTheDocument();
  });
});

describe('PlanList copy to character (#1729)', () => {
  const props = { planHref, onDuplicate: noop, onDelete: noop, onRename: noop };

  it('hides the action when the account has no other character', async () => {
    const user = userEvent.setup();
    render(<PlanList {...props} plans={[plan('1', 'Alpha')]} onCopyToCharacter={noop} />);
    await user.click(screen.getByRole('button', { name: 'More actions for Alpha' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /copy to character/i })).toBeNull();
  });

  it('copies the plan to the chosen character', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <PlanList
        {...props}
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        otherCharacters={[{ characterId: 9, name: 'Alt One' }]}
        onCopyToCharacter={onCopy}
      />
    );
    await user.click(screen.getByRole('button', { name: 'More actions for Beta' }));
    await user.click(screen.getByRole('menuitem', { name: /copy to character/i }));
    await user.click(screen.getByRole('button', { name: 'Alt One' }));
    expect(onCopy).toHaveBeenCalledWith('2', 9);
  });
});

describe('PlanList active plan (#1709)', () => {
  it('marks only the open plan with aria-current', () => {
    render(
      <PlanList
        plans={[plan('1', 'Alpha'), plan('2', 'Beta')]}
        activePlanId="2"
        planHref={planHref}
        onDuplicate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    expect(screen.getByRole('link', { name: /^beta/i })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: /^alpha/i })).not.toHaveAttribute('aria-current');
  });
});

describe('PlanList long name (#2105)', () => {
  it('shows the full name in a tooltip on focus so a truncated name is still readable', async () => {
    const user = userEvent.setup();
    const longName = 'A very long plan name that will surely truncate in the sidebar list';
    render(
      <PlanList
        plans={[plan('1', longName)]}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(longName);
  });
});

describe('PlanList row menu', () => {
  it('renames from the menu', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <PlanList
        plans={[plan('1', 'Alpha')]}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={noop}
        onRename={onRename}
      />
    );
    await user.click(screen.getByRole('button', { name: 'More actions for Alpha' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Rename' });
    await waitFor(() => expect(input).toHaveFocus());
    await user.clear(input);
    await user.type(input, 'Beta{Enter}');
    expect(onRename).toHaveBeenCalledWith('1', 'Beta');
  });

  it('opens a just-created plan straight into rename', () => {
    const started = vi.fn();
    render(
      <PlanList
        plans={[plan('1', 'Alpha')]}
        autoRenamePlanId="1"
        onAutoRenameStarted={started}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Rename' })).toHaveFocus();
    expect(started).toHaveBeenCalled();
  });
});

describe('PlanList row link (DESIGN.md §6c)', () => {
  it('a plan row is a real link to the plan, not a button', () => {
    render(
      <PlanList
        plans={[plan('p1', 'Titan pilot')]}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    expect(screen.getByRole('link', { name: /Titan pilot/ })).toHaveAttribute(
      'href',
      '/skills/plans/p1'
    );
  });
});
