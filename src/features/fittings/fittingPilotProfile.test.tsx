import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePilotProfile } from './fittingPilotProfile';

const loadCorrectedSkills = vi.fn();
const loadCharacterImplants = vi.fn();

vi.mock('@/features/skills/correctedSkills', () => ({
  loadCorrectedSkills: (...args: unknown[]) => loadCorrectedSkills(...args),
}));
vi.mock('@/features/skills/data', () => ({
  loadCharacterImplants: (...args: unknown[]) => loadCharacterImplants(...args),
}));

describe('usePilotProfile', () => {
  beforeEach(() => {
    loadCorrectedSkills.mockReset();
    loadCharacterImplants.mockReset();
  });

  it('reports a failed load instead of staying null forever, and retry recovers', async () => {
    loadCorrectedSkills.mockRejectedValueOnce(new Error('offline'));
    loadCorrectedSkills.mockResolvedValue({ effective: new Map() });
    loadCharacterImplants.mockResolvedValue(null);

    const { result } = renderHook(() => usePilotProfile(1));
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.profile).toBeNull();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });

  it('marks the skills unknown when /skills could not be read at all, known when it was', async () => {
    loadCharacterImplants.mockResolvedValue(null);
    loadCorrectedSkills.mockResolvedValueOnce({ effective: new Map(), skillsResult: null });
    const unknown = renderHook(() => usePilotProfile(1));
    await waitFor(() => expect(unknown.result.current.profile).not.toBeNull());
    expect(unknown.result.current.skillsKnown).toBe(false);

    loadCorrectedSkills.mockResolvedValueOnce({
      effective: new Map([[3300, 5]]),
      skillsResult: { data: { skills: [] } },
    });
    const known = renderHook(() => usePilotProfile(2));
    await waitFor(() => expect(known.result.current.profile).not.toBeNull());
    expect(known.result.current.skillsKnown).toBe(true);
  });
});
