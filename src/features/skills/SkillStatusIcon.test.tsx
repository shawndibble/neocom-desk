import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { SkillStatusIcon } from './SkillStatusIcon';

describe('SkillStatusIcon', () => {
  it.each([
    ['trained', 'Trained'],
    ['partial', 'Partially trained'],
    ['missing', 'Not trained'],
  ] as const)('exposes %s as an image named %s', (status, name) => {
    render(<SkillStatusIcon status={status} />);
    expect(screen.getByRole('img', { name })).toBeInTheDocument();
  });
});
