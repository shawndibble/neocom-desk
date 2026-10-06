/**
 * Prices the Map's ticked what-if planet's Bigger chains (`useWhatIfChains`)
 * and hands them up. Mounted only while the pilot hauls between planets and a
 * what-if is ticked, so with the setting off the Map counts no route and runs
 * no solver: the hook, and the route basis under it, are never mounted.
 */
import { useEffect, useMemo } from 'react';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import type { PlanAdvice } from '../planAdviceModel';
import { NO_WHAT_IF_CHAINS, useWhatIfChains, type WhatIfChainsState } from '../useBiggerChains';

export function WhatIfChainsFeed({
  advice,
  pi,
  type,
  onChange,
}: {
  advice: PlanAdvice;
  pi: PiData;
  type: PlanetType;
  onChange: (state: WhatIfChainsState) => void;
}) {
  const wanted = useMemo(() => [type], [type]);
  const state = useWhatIfChains(advice, pi, wanted);
  useEffect(() => onChange(state), [state, onChange]);
  useEffect(() => () => onChange(NO_WHAT_IF_CHAINS), [onChange]);
  return null;
}
