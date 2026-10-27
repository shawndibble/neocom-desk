import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { StandingTag } from './StandingTag';
import type { CharacterContact } from '@/esi/endpoints';

const CONTACT: CharacterContact = { contact_id: 500001, contact_type: 'character', standing: -10 };

describe('StandingTag', () => {
  it('renders nothing for a stranger — a neutral-looking badge would be a false signal', () => {
    const { container } = render(<StandingTag standing={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels an own entry as the pilot's own contact", () => {
    render(
      <StandingTag
        standing={{
          standing: -10,
          source: 'character',
          sourceId: 500001,
          inherited: false,
          contact: CONTACT,
        }}
      />
    );
    expect(
      screen.getByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toBeInTheDocument();
  });

  it('labels an inherited entry with which tier it came from', () => {
    render(
      <StandingTag
        standing={{
          standing: -10,
          source: 'corporation',
          sourceId: 2,
          inherited: true,
          contact: { ...CONTACT, contact_id: 2, contact_type: 'corporation' },
        }}
      />
    );
    expect(
      screen.getByRole('img', {
        name: 'Terrible standing (-10) — your entry on their corp, not on them',
      })
    ).toBeInTheDocument();
  });
});
