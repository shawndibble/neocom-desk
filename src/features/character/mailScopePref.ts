import { createLocalSetting } from '@/lib/useLocalSetting';
import type { CharacterFilterValue } from './characterFilterValue';

export const MAIL_SCOPE_SETTING_KEY = 'mailScope';

export const useMailScope = createLocalSetting<CharacterFilterValue>({
  key: MAIL_SCOPE_SETTING_KEY,
  defaultValue: 'current',
  parse: (raw) => (raw === 'current' || raw === 'all' ? raw : null),
});
