import { createLocalSetting } from '@/lib/useLocalSetting';
import type { SharedPopTimePref } from './calendarSharedPops';

export const SHARED_POP_TIME_KEY = 'calendarSharedPopTime';

export const SHARED_POP_TIME_CHOICES: readonly SharedPopTimePref[] = [
  'asShared',
  'ready',
  'autoFracture',
];

export const DEFAULT_SHARED_POP_TIME: SharedPopTimePref = 'asShared';

export const useSharedPopTime = createLocalSetting<SharedPopTimePref>({
  key: SHARED_POP_TIME_KEY,
  defaultValue: DEFAULT_SHARED_POP_TIME,
  parse: (raw) =>
    SHARED_POP_TIME_CHOICES.includes(raw as SharedPopTimePref) ? (raw as SharedPopTimePref) : null,
});
