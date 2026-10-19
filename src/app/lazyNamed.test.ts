// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyNamed } from './lazyNamed';

describe('lazyNamed', () => {
  it('renders the named export through lazy()', async () => {
    const Lazy = lazyNamed(
      () => Promise.resolve({ Page: () => createElement('p', null, 'hi') }),
      'Page'
    );
    render(createElement(Suspense, { fallback: null }, createElement(Lazy)));
    expect(await screen.findByText('hi')).toBeTruthy();
  });
});
