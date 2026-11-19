/**
 * Which Pop Time the Calendar shows a Shared moon pop at: the one the officer chose when sharing
 * (`asShared`, the default), or Ready, or Auto-fracture. Device-local like the week start: it
 * changes how one screen draws, and never the notification, which stays on the officer's time.
 */
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
