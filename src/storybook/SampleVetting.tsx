import { useLayoutEffect, type ReactNode } from 'react';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import { setVettingBackendOverride } from '@/features/corp/vetting/vettingBackend';
import { clearVettingHandle, writeVettingHandle } from '@/features/corp/vetting/vettingHandle';
import { SAMPLE_ACTIVE_CHARACTER } from './sampleData';
import { createSrpMemberFixture } from './srpMemberFixture';
import {
  createVettingFixture,
  VETTING_FIXTURE_CORPORATION,
  type VettingFixtureOptions,
} from './vettingFixture';

const APPLY_SLOT = `apply:${VETTING_FIXTURE_CORPORATION.corporationId}` as const;
const REQUEST_SLOT = `request:${SAMPLE_ACTIVE_CHARACTER.characterId}` as const;

/**
 * The vetting stand-in, in place before the page's own load effects run (a layout effect) and
 * fresh per story. An applicant's story also finds its application where a return visit would:
 * the handle in `localStorage`. The SRP stand-in rides along because the rail asks it whether
 * SRP is on for the sample corporation.
 */
export function SampleVetting({
  children,
  options,
}: {
  children: ReactNode;
  options: VettingFixtureOptions;
}) {
  useLayoutEffect(() => {
    const fixture = createVettingFixture(options);
    setVettingBackendOverride(fixture);
    setSrpMemberBackendOverride(createSrpMemberFixture(Date.now(), { enabled: false }));
    if (options.request === 'shared') writeVettingHandle(REQUEST_SLOT, fixture.requestHandle);
    else clearVettingHandle(REQUEST_SLOT);
    if (options.application && options.application !== 'none') {
      writeVettingHandle(APPLY_SLOT, fixture.applicationHandle);
    } else {
      clearVettingHandle(APPLY_SLOT);
    }
    return () => {
      setVettingBackendOverride(null);
      setSrpMemberBackendOverride(null);
      clearVettingHandle(APPLY_SLOT);
      clearVettingHandle(REQUEST_SLOT);
    };
  }, [options]);
  return children;
}
