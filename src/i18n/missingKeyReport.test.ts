import { describe, expect, it, vi } from 'vitest';
import { createMissingKeyHandler } from './missingKeyReport';

describe('createMissingKeyHandler', () => {
  it('reports each missing key once per session', () => {
    const report = vi.fn();
    const handle = createMissingKeyHandler(report);
    handle(['en'], 'translation', 'market.gone', '', false, {});
    handle(['en'], 'translation', 'market.gone', '', false, {});
    handle(['en'], 'translation', 'industry.gone', '', false, {});
    expect(report.mock.calls).toEqual([['market.gone'], ['industry.gone']]);
  });

  it('ignores a lookup that brought its own defaultValue: that key may be missing on purpose', () => {
    const report = vi.fn();
    const handle = createMissingKeyHandler(report);
    handle(['en'], 'translation', 'notifications.eveTypeName.999', 'Fallback', false, {
      defaultValue: 'Fallback',
    });
    expect(report).not.toHaveBeenCalled();
  });
});
