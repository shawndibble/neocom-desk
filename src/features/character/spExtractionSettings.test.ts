import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_SP_EXTRACTION_THRESHOLD_SP,
  SP_EXTRACTION_ENABLED_KEY,
  SP_EXTRACTION_THRESHOLD_KEY,
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from './spExtractionSettings';

beforeEach(async () => {
  await db.settings.clear();
  useSpExtractionMonitoringEnabled.setState({ value: false, hydrated: false });
  useSpExtractionThresholdSp.setState({
    value: DEFAULT_SP_EXTRACTION_THRESHOLD_SP,
    hydrated: false,
  });
});

describe('useSpExtractionMonitoringEnabled', () => {
  it('defaults off', async () => {
    await useSpExtractionMonitoringEnabled.getState().hydrate();
    expect(useSpExtractionMonitoringEnabled.getState().value).toBe(false);
  });

  it('persists a change under the sync.-prefixed key', async () => {
    await useSpExtractionMonitoringEnabled.getState().setValue(true);
    const row = await db.settings.get(SP_EXTRACTION_ENABLED_KEY);
    expect(row?.value).toBe(true);
  });
});

describe('useSpExtractionThresholdSp', () => {
  it('defaults to one extractor chunk', async () => {
    await useSpExtractionThresholdSp.getState().hydrate();
    expect(useSpExtractionThresholdSp.getState().value).toBe(500_000);
  });

  it('persists a chosen threshold', async () => {
    await useSpExtractionThresholdSp.getState().setValue(1_000_000);
    const row = await db.settings.get(SP_EXTRACTION_THRESHOLD_KEY);
    expect(row?.value).toBe(1_000_000);
  });

  it('rejects a damaged stored value and falls back to the default', async () => {
    await db.settings.put({ key: SP_EXTRACTION_THRESHOLD_KEY, value: -5 });
    await useSpExtractionThresholdSp.getState().hydrate();
    expect(useSpExtractionThresholdSp.getState().value).toBe(DEFAULT_SP_EXTRACTION_THRESHOLD_SP);
  });
});
