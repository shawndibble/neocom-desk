import { describe, it, expect, afterEach } from 'vitest';
import {
  INITIAL_BUDGET,
  observeBudget,
  planRequest,
  ERROR_LIMIT_LOW_WATER,
  MAX_BUDGET_WAIT_MS,
  MAX_REQUEST_SPACING_MS,
  DEFAULT_ERROR_WINDOW_MS,
  MAX_CIRCUIT_MS,
  ESI_MAX_IN_FLIGHT,
  passEsiGate,
  observeEsiResponse,
  resetEsiBudget,
  esiBudgetSnapshot,
  EsiBudgetError,
  type BudgetState,
} from './budget';

const NOW = 1_700_000_000_000;

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

/** The state after one healthy response carrying a full budget. */
function healthy(now = NOW): BudgetState {
  return observeBudget(INITIAL_BUDGET, {
    status: 200,
    headers: headers({ 'x-esi-error-limit-remain': '100', 'x-esi-error-limit-reset': '60' }),
    now,
  });
}

describe('observeBudget — reading the headers off every response', () => {
  it('records the error-limit headers from a 200, not only from a failure', () => {
    const state = healthy();
    expect(state.errorRemain).toBe(100);
    expect(state.errorResetAt).toBe(NOW + 60_000);
    expect(state.circuitUntil).toBeNull();
  });

  it('records the error-limit headers from a 304, which carries them too', () => {
    const state = observeBudget(INITIAL_BUDGET, {
      status: 304,
      headers: headers({ 'x-esi-error-limit-remain': '42', 'x-esi-error-limit-reset': '17' }),
      now: NOW,
    });
    expect(state.errorRemain).toBe(42);
    expect(state.errorResetAt).toBe(NOW + 17_000);
  });

  it('records the X-Ratelimit-* family', () => {
    const state = observeBudget(INITIAL_BUDGET, {
      status: 200,
      headers: headers({
        'x-ratelimit-limit': '300',
        'x-ratelimit-remaining': '250',
        'x-ratelimit-reset': '30',
      }),
      now: NOW,
    });
    expect(state.rateRemain).toBe(250);
    expect(state.rateResetAt).toBe(NOW + 30_000);
  });

  it('ignores missing and unparseable headers rather than poisoning the state', () => {
    const state = observeBudget(healthy(), {
      status: 200,
      headers: headers({ 'x-esi-error-limit-remain': 'not-a-number' }),
      now: NOW + 1000,
    });
    expect(state.errorRemain).toBe(100);
    expect(state.errorResetAt).toBe(NOW + 60_000);
  });

  it('does not let a stale reading survive its own window', () => {
    const state = healthy();
    // 61s later the window named by the header has rolled over, so "1 error
    // left" is no longer a statement about now.
    const { plan } = planRequest({ ...state, errorRemain: 1 }, NOW + 61_000);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });
});

describe('observeBudget — the circuit', () => {
  it('shuts the circuit on a 420 until the reset the server named', () => {
    const state = observeBudget(healthy(), {
      status: 420,
      headers: headers({ 'x-esi-error-limit-remain': '0', 'x-esi-error-limit-reset': '45' }),
      now: NOW,
    });
    expect(state.circuitUntil).toBe(NOW + 45_000);
    expect(state.circuitStatus).toBe(420);
  });

  it('falls back to a default window when a 420 names no reset', () => {
    const state = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({}),
      now: NOW,
    });
    expect(state.circuitUntil).toBe(NOW + DEFAULT_ERROR_WINDOW_MS);
  });

  it('shuts the circuit on a 429 for Retry-After seconds', () => {
    const state = observeBudget(INITIAL_BUDGET, {
      status: 429,
      headers: headers({ 'retry-after': '3' }),
      now: NOW,
    });
    expect(state.circuitUntil).toBe(NOW + 3000);
    expect(state.circuitStatus).toBe(429);
  });

  it('uses X-Ratelimit-Reset for a 429 that names no Retry-After', () => {
    const state = observeBudget(INITIAL_BUDGET, {
      status: 429,
      headers: headers({ 'x-ratelimit-reset': '8', 'x-ratelimit-remaining': '0' }),
      now: NOW,
    });
    expect(state.circuitUntil).toBe(NOW + 8000);
  });

  it('clamps an absurd server-named reset so one bad header cannot wedge the app', () => {
    const state = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({ 'x-esi-error-limit-reset': '86400' }),
      now: NOW,
    });
    expect(state.circuitUntil).toBe(NOW + MAX_CIRCUIT_MS);
  });

  it('reopens the circuit on any 2xx — ESI discards every request while limited, so an answer is proof', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({ 'x-esi-error-limit-reset': '45' }),
      now: NOW,
    });
    const recovered = observeBudget(shut, { status: 200, headers: headers({}), now: NOW + 1000 });
    expect(recovered.circuitUntil).toBeNull();
    expect(recovered.circuitStatus).toBeNull();
  });

  it('reopens on a 304 as well', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 429,
      headers: headers({ 'retry-after': '5' }),
      now: NOW,
    });
    const recovered = observeBudget(shut, { status: 304, headers: headers({}), now: NOW + 100 });
    expect(recovered.circuitUntil).toBeNull();
  });

  it('leaves a shut circuit shut on a 4xx that is not a throttle', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({ 'x-esi-error-limit-reset': '45' }),
      now: NOW,
    });
    const still = observeBudget(shut, { status: 404, headers: headers({}), now: NOW + 100 });
    expect(still.circuitUntil).toBe(NOW + 45_000);
  });

  it('leaves the circuit alone on an ordinary error — a 403 spends budget, it does not shut the door', () => {
    const state = observeBudget(healthy(), {
      status: 403,
      headers: headers({ 'x-esi-error-limit-remain': '99', 'x-esi-error-limit-reset': '59' }),
      now: NOW,
    });
    expect(state.circuitUntil).toBeNull();
    expect(state.errorRemain).toBe(99);
  });
});

describe('planRequest — a healthy budget', () => {
  it('admits immediately when nothing has been observed at all', () => {
    const { plan } = planRequest(INITIAL_BUDGET, NOW);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });

  it('admits immediately while the budget is comfortable', () => {
    const { plan } = planRequest(healthy(), NOW);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });

  it('does not advance the admission cursor into the future when it is not spacing', () => {
    const { state } = planRequest(healthy(), NOW);
    const { plan } = planRequest(state, NOW);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });
});

describe('planRequest — braking before the budget is gone', () => {
  it('spaces requests once the error budget drops under the low-water mark', () => {
    const low = observeBudget(INITIAL_BUDGET, {
      status: 403,
      headers: headers({
        'x-esi-error-limit-remain': String(ERROR_LIMIT_LOW_WATER - 10),
        'x-esi-error-limit-reset': '40',
      }),
      now: NOW,
    });

    const first = planRequest(low, NOW);
    expect(first.plan).toEqual({ kind: 'go', waitMs: 0 });

    // The next request in the same instant is held off, so the residual
    // budget is spread across the rest of the window instead of burned now.
    const second = planRequest(first.state, NOW);
    expect(second.plan.kind).toBe('go');
    expect(second.plan.kind === 'go' && second.plan.waitMs).toBeGreaterThan(0);
  });

  it('spaces so the remaining budget would last to the reset even if every request errored', () => {
    const low = observeBudget(INITIAL_BUDGET, {
      status: 403,
      headers: headers({ 'x-esi-error-limit-remain': '20', 'x-esi-error-limit-reset': '20' }),
      now: NOW,
    });
    const first = planRequest(low, NOW);
    const second = planRequest(first.state, NOW);
    // 20 errors left, 20 seconds to go -> one per second.
    expect(second.plan).toEqual({ kind: 'go', waitMs: 1000 });
  });

  it('caps the spacing so a nearly-empty budget never becomes an unbounded stall', () => {
    const nearlyGone = observeBudget(INITIAL_BUDGET, {
      status: 403,
      headers: headers({ 'x-esi-error-limit-remain': '1', 'x-esi-error-limit-reset': '60' }),
      now: NOW,
    });
    const first = planRequest(nearlyGone, NOW);
    const second = planRequest(first.state, NOW);
    expect(second.plan).toEqual({ kind: 'go', waitMs: MAX_REQUEST_SPACING_MS });
  });

  it('brakes on a thin X-Ratelimit-Remaining as well as a thin error budget', () => {
    const low = observeBudget(INITIAL_BUDGET, {
      status: 200,
      headers: headers({
        'x-ratelimit-limit': '300',
        'x-ratelimit-remaining': '10',
        'x-ratelimit-reset': '10',
      }),
      now: NOW,
    });
    const first = planRequest(low, NOW);
    const second = planRequest(first.state, NOW);
    expect(second.plan).toEqual({ kind: 'go', waitMs: 1000 });
  });

  it('refuses rather than queueing a fan-out deeper than the bounded wait', () => {
    let state = observeBudget(INITIAL_BUDGET, {
      status: 403,
      headers: headers({ 'x-esi-error-limit-remain': '10', 'x-esi-error-limit-reset': '20' }),
      now: NOW,
    });
    // 10 left over 20s = 2s apart, so the fourth request is past the 5s bound.
    const plans = [];
    for (let i = 0; i < 5; i += 1) {
      const next = planRequest(state, NOW);
      plans.push(next.plan);
      state = next.state;
    }
    expect(plans[0]).toEqual({ kind: 'go', waitMs: 0 });
    expect(plans[1]).toEqual({ kind: 'go', waitMs: 2000 });
    expect(plans[2]).toEqual({ kind: 'go', waitMs: 4000 });
    expect(plans[3].kind).toBe('refuse');
    expect(plans[4].kind).toBe('refuse');
  });

  it('keeps trickling rather than clamping to zero, so a refusal never starves what a 403 teaches', () => {
    // `features/character/structures.ts` (PR #653) only memoizes a *real* 403;
    // a request the gate refuses teaches it nothing. So the brake must always
    // still admit — it spreads the residual budget out, it does not stop it.
    const low = observeBudget(INITIAL_BUDGET, {
      status: 403,
      headers: headers({ 'x-esi-error-limit-remain': '5', 'x-esi-error-limit-reset': '30' }),
      now: NOW,
    });
    // Even with the queue already refusing, a caller arriving after the last
    // admission's spacing has elapsed is admitted with no wait at all.
    let state = low;
    for (let i = 0; i < 20; i += 1) state = planRequest(state, NOW).state;
    const { plan } = planRequest(state, NOW + MAX_REQUEST_SPACING_MS * 20);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });
});

describe('planRequest — a shut circuit', () => {
  it('waits out a short reset rather than making every caller retry blindly', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 429,
      headers: headers({ 'retry-after': '1' }),
      now: NOW,
    });
    const { plan } = planRequest(shut, NOW);
    expect(plan).toEqual({ kind: 'go', waitMs: 1000 });
  });

  it('refuses a reset longer than the bounded wait, naming the status that shut it', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({ 'x-esi-error-limit-reset': '45' }),
      now: NOW,
    });
    const { plan } = planRequest(shut, NOW);
    expect(plan.kind).toBe('refuse');
    expect(plan.kind === 'refuse' && plan.status).toBe(420);
    expect(plan.kind === 'refuse' && plan.retryAfterMs).toBe(45_000);
  });

  it('never waits longer than the bound, whatever the server named', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 429,
      headers: headers({ 'retry-after': String(MAX_BUDGET_WAIT_MS / 1000 + 30) }),
      now: NOW,
    });
    const { plan } = planRequest(shut, NOW);
    expect(plan.kind).toBe('refuse');
  });

  it('discards a stored instant that a backwards clock jump left in the far future', () => {
    // NTP, a laptop waking, a user changing the time. Every instant this module
    // stores is "some earlier now plus a bounded offset", so a day-long wait is
    // never a real one — obeying it would wedge every ESI call for that day.
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({ 'x-esi-error-limit-reset': '45' }),
      now: NOW,
    });
    const { plan } = planRequest(shut, NOW - 24 * 60 * 60_000);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });

  it('reopens on its own once the named reset has passed', () => {
    const shut = observeBudget(INITIAL_BUDGET, {
      status: 420,
      headers: headers({ 'x-esi-error-limit-reset': '45' }),
      now: NOW,
    });
    const { plan } = planRequest(shut, NOW + 45_001);
    expect(plan).toEqual({ kind: 'go', waitMs: 0 });
  });
});

describe('the app-wide gate', () => {
  afterEach(() => resetEsiBudget());

  it('starts open, and reports what it has observed', async () => {
    const release = await passEsiGate();
    release();
    expect(esiBudgetSnapshot().circuitUntil).toBeNull();
  });

  it('holds requests over the app-wide ceiling until a permit frees up', async () => {
    const releases: Array<() => void> = [];
    for (let i = 0; i < ESI_MAX_IN_FLIGHT; i += 1) {
      releases.push(await passEsiGate());
    }

    let admitted = false;
    const queued = passEsiGate().then((release) => {
      admitted = true;
      return release;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);

    releases[0]();
    (await queued)();
    expect(admitted).toBe(true);
    for (const release of releases.slice(1)) release();
  });

  it('gives a permit back when the caller aborts while queued', async () => {
    const releases: Array<() => void> = [];
    for (let i = 0; i < ESI_MAX_IN_FLIGHT; i += 1) {
      releases.push(await passEsiGate());
    }
    const controller = new AbortController();
    const queued = passEsiGate(controller.signal);
    controller.abort();
    await expect(queued).rejects.toThrow();

    for (const release of releases) release();
    // The aborted waiter must not have kept the permit it never received.
    const after = await passEsiGate();
    after();
  });

  it('refuses a fresh call while the circuit is shut, without touching the network', async () => {
    observeEsiResponse(420, headers({ 'x-esi-error-limit-reset': '60' }));
    await expect(passEsiGate()).rejects.toBeInstanceOf(EsiBudgetError);
    await expect(passEsiGate()).rejects.toMatchObject({ status: 420 });
  });

  it('is reset to a clean slate by resetEsiBudget, so one test cannot shut the next', async () => {
    observeEsiResponse(420, headers({ 'x-esi-error-limit-reset': '60' }));
    resetEsiBudget();
    const release = await passEsiGate();
    release();
  });
});
