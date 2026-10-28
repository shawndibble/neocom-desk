import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * The pilot's "I don't want waypoints" (issue #5415): hides the button, the
 * Character select and the grant note together. One flag, not per Character,
 * and it only applies while the selected Character lacks the permission or no
 * tracked Character holds it, so granting it brings the button back without
 * clearing the flag.
 */
export const useWaypointsDismissed = createLocalSetting<boolean>({
  key: 'waypointsDismissed',
  defaultValue: false,
});
