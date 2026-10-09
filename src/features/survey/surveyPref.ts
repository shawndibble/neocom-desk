/**
 * The Survey this device is tracking, as the id of its stored Share Link.
 * Local, not synced: a Survey is a link anyone can open, so remembering it on
 * one device is a convenience, and "New survey" just forgets it.
 */
import { isShareId } from '@/engine/share/shareId';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const useCurrentSurveyId = createLocalSetting<string | null>({
  key: 'miningSurveyCurrent',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && isShareId(raw) ? raw : null),
});
