import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SCHEDULES,
  buildDispatchRequest,
  dispatchWorkflows,
  workflowsForCron,
} from '../../workers/public-data-dispatch/dispatch.mjs';

const ok = () => Promise.resolve({ status: 204, text: () => Promise.resolve('') });

describe('workflowsForCron', () => {
  it('maps the 15 min cron to the lawless workflow', () => {
    expect(workflowsForCron('*/15 * * * *')).toEqual(['public-data-lawless-systems.yml']);
  });
  it('returns nothing for an unknown cron', () => {
    expect(workflowsForCron('0 0 * * *')).toEqual([]);
  });
});

describe('buildDispatchRequest', () => {
  it('posts a workflow_dispatch for develop with the token and a User-Agent', () => {
    const { url, init } = buildDispatchRequest('public-data-lawless-systems.yml', 'tok');
    expect(url).toBe(
      'https://api.github.com/repos/shawndibble/neocom-desk/actions/workflows/public-data-lawless-systems.yml/dispatches'
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['User-Agent']).toBeTruthy();
    expect(JSON.parse(init.body)).toEqual({ ref: 'develop' });
  });
});

describe('dispatchWorkflows', () => {
  it('dispatches each mapped workflow', async () => {
    const fetchFn = vi.fn(ok);
    const done = await dispatchWorkflows('*/15 * * * *', 'tok', fetchFn);
    expect(done).toEqual(['public-data-lawless-systems.yml']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('throws on a non-204 so the invocation shows as failed', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({ status: 401, text: () => Promise.resolve('Bad credentials') })
    );
    await expect(dispatchWorkflows('*/15 * * * *', 'tok', fetchFn)).rejects.toThrow(/HTTP 401/);
  });
  it('throws on an unmapped cron without calling GitHub', async () => {
    const fetchFn = vi.fn(ok);
    await expect(dispatchWorkflows('1 1 * * *', 'tok', fetchFn)).rejects.toThrow(/No workflows/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('reports a network error and still tries the remaining workflows', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(dispatchWorkflows('*/15 * * * *', 'tok', fetchFn)).rejects.toThrow(/boom/);
  });
  it('caps the echoed response body', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({ status: 500, text: () => Promise.resolve('x'.repeat(5000)) })
    );
    const err = await dispatchWorkflows('*/15 * * * *', 'tok', fetchFn).catch((e) => e);
    expect(err.message.length).toBeLessThan(400);
  });
  it('throws when the token is missing', async () => {
    const fetchFn = vi.fn(ok);
    await expect(dispatchWorkflows('*/15 * * * *', '', fetchFn)).rejects.toThrow(/GITHUB_TOKEN/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('wrangler.toml', () => {
  it('lists exactly the crons SCHEDULES maps', () => {
    const toml = readFileSync(
      new URL('../../workers/public-data-dispatch/wrangler.toml', import.meta.url),
      'utf8'
    );
    const crons = [...toml.match(/crons\s*=\s*\[(.*?)\]/s)[1].matchAll(/"([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(crons.sort()).toEqual(Object.keys(SCHEDULES).sort());
  });
});
