/**
 * A stand-in for the Doctrine Fit callables and reads, for Storybook and tests: set, every
 * `srpDoctrineClient` call answers from memory. Never set by the app itself. Its own module, like
 * `srpBackendOverride.ts`, so a test that mocks the client still leaves it unset.
 */
import type { DoctrineFit, SaveDoctrineInput } from './srpTypes';

export interface SrpDoctrineBackendOverride {
  list: () => DoctrineFit[];
  save: (input: SaveDoctrineInput) => { id: string };
  remove: (id: string) => void;
}

let override: SrpDoctrineBackendOverride | null = null;

export const setSrpDoctrineBackendOverride = (next: SrpDoctrineBackendOverride | null): void => {
  override = next;
};

export const srpDoctrineBackendOverride = (): SrpDoctrineBackendOverride | null => override;
