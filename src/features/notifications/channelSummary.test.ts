import { describe, expect, it } from 'vitest';
import { applyToAllFlips, summarizeChannels } from './channelSummary';

const on = () => true;
const off = () => false;

describe('summarizeChannels', () => {
  it('reports every channel checked and nobody differing when all characters agree', () => {
    const summary = summarizeChannels([1, 2, 3], on);
    expect(summary.state).toEqual({ browser: 'checked', feed: 'checked' });
    expect(summary.differingIds).toEqual([]);
    expect(summary.alike).toBe(true);
  });

  it('reports unchecked when every character has the channel off', () => {
    const summary = summarizeChannels([1, 2], off);
    expect(summary.state).toEqual({ browser: 'unchecked', feed: 'unchecked' });
    expect(summary.alike).toBe(true);
  });

  it('is indeterminate where characters disagree and names the minority', () => {
    // character 3 alone has the device channel off
    const summary = summarizeChannels(
      [1, 2, 3],
      (id, channel) => !(id === 3 && channel === 'browser')
    );
    expect(summary.state).toEqual({ browser: 'indeterminate', feed: 'checked' });
    expect(summary.differingIds).toEqual([3]);
    expect(summary.alike).toBe(false);
  });

  it('counts a character once even when it differs on both channels', () => {
    const summary = summarizeChannels([1, 2, 3], (id) => id !== 2);
    expect(summary.differingIds).toEqual([2]);
  });

  it('on an even split names the characters that are off', () => {
    const summary = summarizeChannels([1, 2, 3, 4], (id, channel) => channel !== 'feed' || id <= 2);
    expect(summary.state.feed).toBe('indeterminate');
    expect(summary.differingIds).toEqual([3, 4]);
  });

  it('unions the minorities of both channels', () => {
    const summary = summarizeChannels([1, 2, 3, 4, 5], (id, channel) =>
      channel === 'browser' ? id !== 1 : id !== 5
    );
    expect(summary.differingIds).toEqual([1, 5]);
  });

  it('handles no characters: unchecked and alike, so the row can disable itself', () => {
    const summary = summarizeChannels([], on);
    expect(summary.state).toEqual({ browser: 'unchecked', feed: 'unchecked' });
    expect(summary.alike).toBe(true);
    expect(summary.differingIds).toEqual([]);
  });

  it('handles a single character', () => {
    const summary = summarizeChannels([7], (_id, channel) => channel === 'feed');
    expect(summary.state).toEqual({ browser: 'unchecked', feed: 'checked' });
    expect(summary.differingIds).toEqual([]);
  });
});

describe('applyToAllFlips', () => {
  it('names only the Characters that differ from the majority, per channel', () => {
    // character 3 alone has the device channel off
    const flips = applyToAllFlips([1, 2, 3], (id, channel) => !(id === 3 && channel === 'browser'));
    expect(flips).toEqual({ browser: [3], feed: [] });
  });

  it('flips nobody when every Character already agrees', () => {
    expect(applyToAllFlips([1, 2], on)).toEqual({ browser: [], feed: [] });
    expect(applyToAllFlips([1, 2], off)).toEqual({ browser: [], feed: [] });
  });

  it('on an even split turns the Characters that are off on, as the differ marks say', () => {
    const flips = applyToAllFlips([1, 2, 3, 4], (id, channel) => channel !== 'feed' || id <= 2);
    expect(flips).toEqual({ browser: [], feed: [3, 4] });
  });
});
