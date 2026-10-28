import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * The pilot's "I don't want waypoints" (issue #5415): hides the button, the
 * Character select and the grant note. One flag, not per Character. The grant
 * note stays hidden whenever it is set; the button and select hide only while
 * no tracked Character holds the permission, so granting it anywhere brings
 * the button back without clearing the flag.
 */
export const useWaypointsDismissed = createLocalSetting<boolean>({
  key: 'waypointsDismissed',
  defaultValue: false,
});
