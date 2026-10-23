/**
 * A stand-in for the SRP backend, for Storybook and its smoke test: set, every
 * `srpClient` call answers from memory, so a page story shows the settings page without a
 * network, a sign-in or Firebase. Never set by the app itself. Its own module so a test that
 * mocks the client still leaves the override unset.
 */
import type { SrpOfficerVerdict, SrpSettings, SrpSettingsPatch, SrpStatus } from './srpTypes';

export interface SrpBackendOverride {
  verify: () => SrpOfficerVerdict;
  /** The settings doc, or null before SRP was ever turned on. */
  readSettings: () => SrpSettings | null;
  status: () => SrpStatus;
  turnOn: () => void;
  turnOff: () => void;
  save: (patch: SrpSettingsPatch) => void;
  reclaim: () => { officersRevoked: number };
}

let override: SrpBackendOverride | null = null;

export const setSrpBackendOverride = (next: SrpBackendOverride | null): void => {
  override = next;
};

export const srpBackendOverride = (): SrpBackendOverride | null => override;
