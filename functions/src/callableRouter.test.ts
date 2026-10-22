import { describe, expect, it } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { createActionGroup } from './callableRouter.js';

const req = (data: unknown) => ({ data, auth: { uid: 'char:1' } }) as CallableRequest<unknown>;

describe('createActionGroup', () => {
  it('runs the named handler with the inner data and the original request fields', async () => {
    const group = createActionGroup();
    group.register('a', (r) => ({ got: r.data, uid: r.auth?.uid }));
    group.register('b', () => 'other');
    expect(await group.route(req({ action: 'a', data: { x: 1 } }))).toEqual({
      got: { x: 1 },
      uid: 'char:1',
    });
  });

  it('returns the handler it registered, for a standalone export', () => {
    const group = createActionGroup();
    const handler = () => 1;
    expect(group.register('a', handler)).toBe(handler);
  });

  it.each([undefined, null, 'a', {}, { action: 7 }, { action: 'missing' }])(
    'rejects %j as invalid-argument',
    (body) => {
      const group = createActionGroup();
      group.register('a', () => 1);
      expect(() => group.route(req(body))).toThrow(
        expect.objectContaining({ code: 'invalid-argument' })
      );
    }
  );

  it('refuses a duplicate action name', () => {
    const group = createActionGroup();
    group.register('a', () => 1);
    expect(() => group.register('a', () => 2)).toThrow(/Duplicate/);
  });
});
