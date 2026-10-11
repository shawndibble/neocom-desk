import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../.storybook/preview';

// Every story is also a smoke test: it must render with the same decorators
// Storybook gives it. Runs in the existing `dom` Vitest project, so the CI
// `test` shards pick it up and no new required check appears.
setProjectAnnotations(preview.default);

const modules = import.meta.glob<Record<string, unknown>>('./**/*.stories.{ts,tsx}', {
  eager: true,
});

describe.each(Object.entries(modules))('%s', (_file, mod) => {
  const stories = composeStories(mod as Parameters<typeof composeStories>[0]) as Record<
    string,
    ComponentType
  >;
  it.each(Object.entries(stories))('%s renders', (_name, Story) => {
    const { container } = render(<Story />);
    expect(container).not.toBeEmptyDOMElement();
  });
});
