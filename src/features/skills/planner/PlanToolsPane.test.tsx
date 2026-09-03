import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PlanToolsPane } from './PlanToolsPane';

const SECTIONS = [
  { id: 'actions', title: 'Actions', content: <button type="button">Optimize remaps</button> },
  {
    id: 'attributes',
    title: 'Attributes',
    content: <button type="button">Booster</button>,
    actions: <time dateTime="2025-01-01T00:00:00.000Z">2 days ago</time>,
  },
  { id: 'importExport', title: 'Import / Export', content: <button type="button">Export</button> },
];

/**
 * `closest('section')`, not `parentElement`: a heading shares a flex row with
 * its section's optional right-aligned actions.
 */
function sectionFor(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section');
  if (!section) throw new Error(`expected a section for "${title}"`);
  return section as HTMLElement;
}

describe('PlanToolsPane', () => {
  it('groups every tool into one panel of labelled sections, not one panel each', () => {
    render(<PlanToolsPane sections={SECTIONS} asDisclosure={false} />);

    // One Panel: its title, plus a heading per section inside it.
    const pane = screen.getByRole('heading', { name: 'Plan tools' }).closest('section');
    if (!pane) throw new Error('expected the tools panel');

    for (const { title } of SECTIONS) {
      expect(within(pane).getByRole('heading', { name: title })).toBeInTheDocument();
    }

    // The controls themselves live inside that same single panel.
    expect(within(pane).getByRole('button', { name: 'Optimize remaps' })).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Booster' })).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('separates sections with a single hairline, never two stacked borders', () => {
    render(<PlanToolsPane sections={SECTIONS} asDisclosure={false} />);

    const sections = SECTIONS.map((s) => sectionFor(s.title));

    // Every section but the last carries the separator; the last carries none,
    // so the panel's own bottom border isn't doubled.
    expect(sections[0]).toHaveClass('border-b');
    expect(sections[1]).toHaveClass('border-b');
    expect(sections[2]).not.toHaveClass('border-b');
  });

  it('folds to a single collapsed disclosure row below `lg`, so the tools cost one row instead of three panels', async () => {
    const user = userEvent.setup();
    render(<PlanToolsPane sections={SECTIONS} asDisclosure />);

    const toggle = screen.getByRole('button', { name: /plan tools/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: none of the controls are rendered at all.
    expect(screen.queryByRole('button', { name: 'Optimize remaps' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Booster' })).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Optimize remaps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Booster' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('lets the disclosure own the separators in disclosure mode, so they are not drawn twice', async () => {
    const user = userEvent.setup();
    render(<PlanToolsPane sections={SECTIONS} asDisclosure />);
    await user.click(screen.getByRole('button', { name: /plan tools/i }));

    for (const { title } of SECTIONS) {
      expect(sectionFor(title)).not.toHaveClass('border-b');
    }
  });

  it("renders a section's actions beside its heading, not inside its accessible name", () => {
    render(<PlanToolsPane sections={SECTIONS} asDisclosure={false} />);

    // The badge is in the section's header row...
    const section = sectionFor('Attributes');
    expect(section.querySelector('time')).toHaveTextContent('2 days ago');
    // ...but the heading is still named for the section alone, so a lookup by
    // title can't drift with the badge's ticking text.
    expect(screen.getByRole('heading', { name: 'Attributes' }).textContent).toBe('Attributes');
  });
});
