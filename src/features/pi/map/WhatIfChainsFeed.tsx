/**
 * Prices the Map's ticked what-if planets' Bigger chains, together (`useWhatIfChains`)
 * and hands them up. Mounted only while the pilot hauls between planets and a
 * what-if is ticked, so with the setting off the Map counts no route and runs
 * no solver: the hook, and the route basis under it, are never mounted.
 */
import { useEffect, useMemo } from 'react';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import type { PlanAdvice } from '../planAdviceModel';
import { useWhatIfChains, type WhatIfChainsState } from '../useBiggerChains';

export function WhatIfChainsFeed({
  advice,
  pi,
  types,
  onChange,
}: {
  advice: PlanAdvice;
  pi: PiData;
  /** The ticked types, sorted: priced as one set, a new planet of each. */
  types: readonly PlanetType[];
  /** With the advice it was priced for: the parent drops a state that is a render behind. */
  onChange: (fed: { advice: PlanAdvice; state: WhatIfChainsState } | null) => void;
}) {
  const wanted = useMemo(() => [types], [types]);
  const state = useWhatIfChains(advice, pi, wanted);
  useEffect(() => onChange({ advice, state }), [advice, state, onChange]);
  useEffect(() => () => onChange(null), [onChange]);
  return null;
}
