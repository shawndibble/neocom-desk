import { describe, expect, it } from 'vitest';
import { feedsOf, kindSumsAcrossCharacters, buildView } from './models';
import type { BuildContext, FeedState } from './types';
import type { ContractsBoardData } from '../../data/boardData';
import { summarizeContractsBoard } from '@/engine/contracts/contractsBoard';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const board = (needsReauth = false): ContractsBoardData => ({
  summary: summarizeContractsBoard([], new Set([1, 2]), NOW),
  route: null,
  needsReauth,
  fetchedAt: new Date(NOW),
});

describe('Contracts across every Character', () => {
  it('reads its own feed when scoped to All', () => {
    expect(kindSumsAcrossCharacters('contracts')).toBe(true);
    expect(feedsOf('contracts', undefined, true)).toEqual(['contractsAll']);
    expect(feedsOf('contracts')).toEqual(['contracts']);
  });

  it("draws the All board, not the header Character's", () => {
    const view = buildView(
      'contracts',
      { contractsAll: ok(board()), contracts: ok(board(true)) },
      ctx()
    );
    expect(view.status.needsPermission).toBe(false);
  });

  it('asks for permission when every Character lapsed', () => {
    const view = buildView('contracts', { contractsAll: ok(board(true)) }, ctx());
    expect(view.status.needsPermission).toBe(true);
  });
});
