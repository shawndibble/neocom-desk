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
  types: readonly PlanetType[];
  onChange: (fed: { advice: PlanAdvice; state: WhatIfChainsState } | null) => void;
}) {
  const wanted = useMemo(() => [types], [types]);
  const state = useWhatIfChains(advice, pi, wanted);
  useEffect(() => onChange({ advice, state }), [advice, state, onChange]);
  useEffect(() => () => onChange(null), [onChange]);
  return null;
}
