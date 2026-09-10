import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { StopTierCardHint } from './ColonyActions';
import type { ColonyStopTierAdvice } from './stopTierModel';
import type { ScoredStopTier } from '@/engine/pi/stopTier';

const NANITES = 2634;

const scoredCandidate: ScoredStopTier = {
  status: 'scored',
  typeId: NANITES,
  name: 'Nanites',
  tier: 1,
  blocks: 4,
  pins: { advanced: 4 },
  limitedBy: ['cpu'],
  unitsPerHour: 100,
  marginPerUnit: 500,
  marginPerHour: 50_000,
  throughput: {
    verdict: 'ok',
    flowPerHourM3: 100,
    bufferM3: 5_000,
    bufferNeedM3: 2_400,
    linkCapacityPerHour: 1_250,
  },
};

/**
 * The hint distinguishes "Build up to" (this planet alone, rebuilt) from "Do
 * this" (added given every colony's supply, #702) — but only when there is a
 * rebuild proposed for it to be confused with.
 */
describe('StopTierCardHint', () => {
  it('renders the disambiguation when a rebuild is recommended', () => {
    const advice: ColonyStopTierAdvice = {
      status: 'advised',
      advice: { kind: 'recommended', best: scoredCandidate, entries: [scoredCandidate] },
      alreadyRunning: false,
    };
    render(<StopTierCardHint result={advice} extractedPerHour={[]} />);
    expect(screen.getByText(/a different question from "Do this" above/)).toBeInTheDocument();
  });

  it('stays silent when the colony is already running the winner', () => {
    const advice: ColonyStopTierAdvice = {
      status: 'advised',
      advice: {
        kind: 'recommended',
        best: { ...scoredCandidate, tier: 0 },
        entries: [{ ...scoredCandidate, tier: 0 }],
      },
      alreadyRunning: true,
    };
    render(
      <StopTierCardHint
        result={advice}
        extractedPerHour={[{ typeId: NANITES, unitsPerHour: 100 }]}
      />
    );
    expect(screen.queryByText(/a different question from/)).not.toBeInTheDocument();
  });

  it('stays silent when nothing could be recommended', () => {
    const advice: ColonyStopTierAdvice = {
      status: 'advised',
      advice: { kind: 'no-recommendation', blocker: 'does-not-fit', entries: [] },
      alreadyRunning: false,
    };
    render(<StopTierCardHint result={advice} extractedPerHour={[]} />);
    expect(screen.queryByText(/a different question from/)).not.toBeInTheDocument();
  });

  it('stays silent when this colony has no rate of its own to score', () => {
    const advice: ColonyStopTierAdvice = { status: 'needs-measured-extraction' };
    render(<StopTierCardHint result={advice} extractedPerHour={[]} />);
    expect(screen.queryByText(/a different question from/)).not.toBeInTheDocument();
  });
});
