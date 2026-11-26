import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ErrorProbe } from './ErrorProbe';

describe('ErrorProbe', () => {
  it('throws on render, with a message that identifies itself as deliberate', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ErrorProbe />)).toThrow('Deliberate probe: /error route render throw');
    consoleError.mockRestore();
  });
});
