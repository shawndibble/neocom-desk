import type { Decorator } from '@storybook/react-vite';
import { SampleVetting } from './SampleVetting';
import type { VettingFixtureOptions } from './vettingFixture';

declare module 'storybook/internal/csf' {
  interface Parameters {
    /** The vetting stand-in a story runs against (`withSampleVetting`). */
    vetting?: VettingFixtureOptions;
  }
}

const NO_OPTIONS: VettingFixtureOptions = {};

/** Runs a story against `parameters.vetting` (a `VettingFixtureOptions`; the default queue when absent). */
export const withSampleVetting: Decorator = (Story, context) => (
  <SampleVetting options={context.parameters.vetting ?? NO_OPTIONS}>
    <Story />
  </SampleVetting>
);
