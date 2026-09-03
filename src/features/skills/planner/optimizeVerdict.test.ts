import { describe, it, expect } from 'vitest';
import type { Attributes } from '@/engine/types';
import type { PlaceRemapsResult, RemapSegment } from '@/engine/optimizer';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from './planHeaderStats';
import { markerVerdict, remapVerdict } from './optimizeVerdict';

const ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

const segment = (remap: boolean): RemapSegment => ({
  startIndex: 0,
  endIndex: 0,
  attributes: ATTRIBUTES,
  seconds: 1000,
  remap,
});

const result = (savingsSeconds: number, segments: RemapSegment[]): PlaceRemapsResult => ({
  segments,
  totalSeconds: 1000,
  currentSeconds: 1000 + savingsSeconds,
  savingsSeconds,
});

describe('remapVerdict', () => {
  it('reports the savings when they clear the meaningful threshold', () => {
    expect(remapVerdict(result(86_400, [segment(false), segment(true)]), 1)).toEqual({
      kind: 'saves',
      savingsSeconds: 86_400,
    });
  });

  // The bug: a plan whose Remaps Available is 0 makes placeRemaps return the
  // no-remap result by definition (it has nothing to place), and the planner
  // reported that as a verdict about the *plan* — "no remap improves this
  // plan in its current order", pointing the user at "Suggest reorder".
  // Reordering cannot help; only raising Remaps Available can.
  it('reports zero Remaps Available rather than blaming the plan', () => {
    expect(remapVerdict(result(0, [segment(false)]), 0)).toEqual({ kind: 'noRemapsAvailable' });
  });

  it('still reports zero Remaps Available when the count is negative', () => {
    expect(remapVerdict(result(0, [segment(false)]), -1)).toEqual({ kind: 'noRemapsAvailable' });
  });

  it('reports no gain when a remap was available but none improves the plan', () => {
    expect(remapVerdict(result(0, [segment(false)]), 2)).toEqual({ kind: 'noGain' });
  });

  it('treats sub-threshold savings as no gain', () => {
    expect(remapVerdict(result(MIN_MEANINGFUL_SAVINGS_SECONDS - 1, [segment(true)]), 2)).toEqual({
      kind: 'noGain',
    });
  });

  it('treats savings exactly at the threshold as meaningful', () => {
    expect(remapVerdict(result(MIN_MEANINGFUL_SAVINGS_SECONDS, [segment(true)]), 2)).toEqual({
      kind: 'saves',
      savingsSeconds: MIN_MEANINGFUL_SAVINGS_SECONDS,
    });
  });
});

describe('markerVerdict', () => {
  it('reports the savings when they clear the meaningful threshold', () => {
    expect(markerVerdict(result(86_400, [segment(false), segment(true)]))).toEqual({
      kind: 'saves',
      savingsSeconds: 86_400,
    });
  });

  // The other half of the bug: "Add remap marker" appends the marker at the
  // end of the entry list, and optimizeAtMarkers drops the empty segment it
  // delimits — so an undragged marker yields exactly zero savings and no
  // remapped segment at all. That is not "remapping here doesn't save time".
  it('reports markers that never split the plan, rather than no gain', () => {
    expect(markerVerdict(result(0, [segment(false)]))).toEqual({ kind: 'markersAtEnd' });
  });

  it('reports markers that split nothing even on an empty result', () => {
    expect(markerVerdict(result(0, []))).toEqual({ kind: 'markersAtEnd' });
  });

  // A marker that does split the plan but lands somewhere unhelpful is the
  // pre-existing "try moving them" case, and must stay distinguishable.
  it('reports no gain when a marker splits the plan but the remap does not pay', () => {
    expect(markerVerdict(result(0, [segment(false), segment(true)]))).toEqual({ kind: 'noGain' });
  });

  it('reports no gain when remapping at the markers is an outright loss', () => {
    expect(markerVerdict(result(-500, [segment(true)]))).toEqual({ kind: 'noGain' });
  });
});
