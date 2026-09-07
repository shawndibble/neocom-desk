import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ErrorProbe } from './ErrorProbe';

describe('ErrorProbe', () => {
  it('throws on render, with a message that identifies itself as deliberate', () => {
    // React logs the throw before rethrowing it; silence that, not the assertion.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ErrorProbe />)).toThrow('Deliberate probe: /error route render throw');
    consoleError.mockRestore();
  });
});
