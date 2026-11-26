import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

const KEY = 'miningSurveySubmitted';

export function hasSubmittedScan(): boolean {
  return readLocal(KEY) === '1';
}

export function noteSubmittedScan(): void {
  writeLocal(KEY, '1');
}
