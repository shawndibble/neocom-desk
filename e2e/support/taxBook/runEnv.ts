import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const KEY_DIR = join(tmpdir(), 'neocom-e2e-book');
export const EVE_CLIENT_ID = 'e2e-fake-client';
export const PROJECT_ID = 'demo-neocom-desk';
export const FIRESTORE = 'http://127.0.0.1:8080';
export const EMULATOR_HOSTS = ['127.0.0.1:9099', '127.0.0.1:8080', '127.0.0.1:5001'];
