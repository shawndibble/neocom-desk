import { createLocalSetting } from '@/lib/useLocalSetting';

export const useWaypointsDismissed = createLocalSetting<boolean>({
  key: 'waypointsDismissed',
  defaultValue: false,
});
