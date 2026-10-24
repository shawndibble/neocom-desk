/** True once launched as an installed PWA (Android/desktop `display-mode`, or iOS's own flag). */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneMedia =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}
