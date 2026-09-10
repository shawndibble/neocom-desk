import { describe, it, expect } from 'vitest';
import { encryptExportPayload, decryptExportPayload, BackupDecryptError } from './crypto';

describe('encryptExportPayload / decryptExportPayload', () => {
  it('round-trips a payload under the correct password', async () => {
    const payload = { characters: [{ characterId: 1, name: 'Alt One' }] };
    const file = await encryptExportPayload(payload, 'correct horse battery staple');

    expect(file.app).toBe('neocom-desk-backup');
    expect(file.version).toBe(1);
    expect(file.kdf).toBe('PBKDF2-SHA256');

    await expect(decryptExportPayload(file, 'correct horse battery staple')).resolves.toEqual(
      payload
    );
  });

  it('fails cleanly with a distinguishable error on the wrong password', async () => {
    const file = await encryptExportPayload({ hello: 'world' }, 'right-password');
    await expect(decryptExportPayload(file, 'wrong-password')).rejects.toBeInstanceOf(
      BackupDecryptError
    );
  });

  it('fails cleanly on a corrupted ciphertext', async () => {
    const file = await encryptExportPayload({ hello: 'world' }, 'a-password');
    const corrupted = { ...file, ciphertext: btoa('not-the-real-ciphertext-bytes!!') };
    await expect(decryptExportPayload(corrupted, 'a-password')).rejects.toBeInstanceOf(
      BackupDecryptError
    );
  });
});
