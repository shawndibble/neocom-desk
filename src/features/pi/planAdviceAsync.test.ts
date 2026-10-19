import { describe, expect, it } from 'vitest';
import { adviceInput } from './map/mapFixtures.testutil';
import { buildPlanAdvice } from './planAdviceModel';
import { askAdvice } from './planAdviceAsync';

describe('askAdvice', () => {
  it('runs the model on the page where there is no Worker', async () => {
    const input = adviceInput('lean');
    expect(await askAdvice(input)).toEqual(buildPlanAdvice(input));
  });
});
