import { describe, expect, it } from 'vitest';
import { buildPlanAdvice } from './planAdviceModel';
import { adviceInput } from './map/mapFixtures.testutil';
import { answerPlanAdvice, emptyPlanAdviceState, toWireInput } from './planAdvice.worker';

describe('answerPlanAdvice', () => {
  it('answers like the model, once the SDE slice has been loaded', () => {
    const input = adviceInput('lean');
    const state = emptyPlanAdviceState();
    state.pi = input.snapshot.pi;
    const reply = answerPlanAdvice(state, { kind: 'advice', id: 7, input: toWireInput(input) });
    expect(reply).toEqual({ id: 7, advice: buildPlanAdvice(input) });
  });

  it('survives a structured-clone round trip both ways', () => {
    const input = adviceInput('lean');
    const state = emptyPlanAdviceState();
    state.pi = structuredClone(input.snapshot.pi);
    const wire = structuredClone(toWireInput(input));
    const reply = answerPlanAdvice(state, { kind: 'advice', id: 1, input: wire });
    expect('advice' in reply && structuredClone(reply.advice)).toEqual(buildPlanAdvice(input));
  });

  it('replies with an error, not a guess, before the SDE slice arrives', () => {
    const reply = answerPlanAdvice(emptyPlanAdviceState(), {
      kind: 'advice',
      id: 2,
      input: toWireInput(adviceInput('lean')),
    });
    expect(reply).toEqual({ id: 2, error: 'pi not loaded' });
  });

  it('replies with the model error message when the model throws', () => {
    const input = { ...adviceInput('lean'), books: null } as never;
    const state = emptyPlanAdviceState();
    state.pi = adviceInput('lean').snapshot.pi;
    const reply = answerPlanAdvice(state, { kind: 'advice', id: 3, input: toWireInput(input) });
    expect(reply).toMatchObject({ id: 3, error: expect.any(String) });
  });
});
