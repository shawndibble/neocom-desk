import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkStorageAtRisk, useStorageAtRisk } from './storageAtRisk';

function storage(persisted: boolean) {
  return { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => true) };
}

beforeEach(() => {
  useStorageAtRisk.setState({ atRisk: false });
});

describe('checkStorageAtRisk', () => {
  it('flags an installed app whose storage is not protected', async () => {
    await checkStorageAtRisk(true, storage(false));
    expect(useStorageAtRisk.getState().atRisk).toBe(true);
  });

  it('clears once storage is protected', async () => {
    useStorageAtRisk.setState({ atRisk: true });
    await checkStorageAtRisk(true, storage(true));
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });

  it('never flags a browser tab', async () => {
    await checkStorageAtRisk(false, storage(false));
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });

  it('never flags a browser that cannot say', async () => {
    await checkStorageAtRisk(true, undefined);
    expect(useStorageAtRisk.getState().atRisk).toBe(false);
  });
});
