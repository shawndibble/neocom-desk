// Encrypted backup file crypto (issue #789). Browser-only: uses WebCrypto,
// same tier as auth/pkce.ts. No Dexie/fetch/DOM — pure encrypt/decrypt.

const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface BackupFile {
  app: 'neocom-desk-backup';
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
}

/** Thrown by {@link decryptExportPayload} on GCM auth-tag failure — wrong password or a corrupted file, deliberately not distinguished. */
export class BackupDecryptError extends Error {
  constructor() {
    super('Unable to decrypt file');
    this.name = 'BackupDecryptError';
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypts `payload` (JSON-serialized) under `password`, returning the self-describing file shape written to disk. */
export async function encryptExportPayload(
  payload: unknown,
  password: string
): Promise<BackupFile> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    app: 'neocom-desk-backup',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypts a {@link BackupFile} under `password`, returning the parsed payload. Throws {@link BackupDecryptError} on wrong password or corruption — the two are indistinguishable by design (GCM auth-tag failure either way). */
export async function decryptExportPayload(file: BackupFile, password: string): Promise<unknown> {
  const salt = fromBase64(file.salt);
  const iv = fromBase64(file.iv);
  const key = await deriveKey(password, salt, file.iterations);
  const ciphertext = fromBase64(file.ciphertext);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new BackupDecryptError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}
