// Repo root, resolved once. Lives in scripts/lib, so the root is two levels up.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCRIPTS_DIR = join(ROOT, 'scripts');
