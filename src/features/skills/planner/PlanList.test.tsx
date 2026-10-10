import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { createRef, useState, type ReactElement } from 'react';
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

describe('PlanList keyboard focus (WCAG 2.4.3)', () => {
  const moreOf = (name: string) => screen.getByRole('button', { name: `More actions for ${name}` });

  function Harness({ initial, headingRef }: { initial: SkillPlanRecord[]; headingRef?: never }) {
    const [plans, setPlans] = useState(initial);
    return (
      <PlanList
        plans={plans}
        planHref={planHref}
        onDuplicate={noop}
        onDelete={async (id) => {
          await Promise.resolve();
          setPlans((current) => current.filter((p) => p.id !== id));
        }}
        onRename={noop}
        otherCharacters={[{ characterId: 9, name: 'Other Pilot' }]}
        onCopyToCharacter={noop}
        headingRef={headingRef}
      />
    );
  }

  it('moves focus to the next plan link after a delete', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[plan('1', 'Alpha'), plan('2', 'Beta')]} />);
    await user.click(moreOf('Alpha'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Beta/ })).toHaveFocus());
  });

  it('falls back to the previous plan link when the last row is deleted', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[plan('1', 'Alpha'), plan('2', 'Beta')]} />);
    await user.click(moreOf('Beta'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Alpha/ })).toHaveFocus());
  });

  it('falls back to the panel title when the only plan is deleted', async () => {
    const user = userEvent.setup();
    const headingRef = createRef<HTMLHeadingElement>();
    render(
      <>
        <h2 ref={headingRef} tabIndex={-1}>
          Plans
        </h2>
        <Harness initial={[plan('1', 'Alpha')]} headingRef={headingRef as never} />
      </>
    );
    await user.click(moreOf('Alpha'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plans' })).toHaveFocus());
  });

  it('returns focus to the row ⋮ when the delete dialog is cancelled', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[plan('1', 'Alpha')]} />);
    await user.click(moreOf('Alpha'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(moreOf('Alpha')).toHaveFocus());
  });

  it('returns focus to the row ⋮ after copying to a character', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[plan('1', 'Alpha')]} />);
    await user.click(moreOf('Alpha'));
    await user.click(await screen.findByRole('menuitem', { name: 'Copy to character…' }));
    await user.click(screen.getByRole('button', { name: 'Other Pilot' }));
    await waitFor(() => expect(moreOf('Alpha')).toHaveFocus());
  });

  it.each(['{Enter}', '{Escape}'])(
    'returns focus to the row ⋮ after rename ends with %s',
    async (key) => {
      const user = userEvent.setup();
      render(<Harness initial={[plan('1', 'Alpha')]} />);
      await user.click(moreOf('Alpha'));
      await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      await user.type(screen.getByRole('textbox', { name: 'Rename' }), `Z${key}`);
      await waitFor(() => expect(moreOf('Alpha')).toHaveFocus());
    }
  );
});
