/** Which SRP view `/corp/srp` shows the pilot. Only the member view exists so far (issue #4852). */
export type SrpView = 'member';

/**
 * The seam for the officer queue and the Director's settings (issues #4851 and after): they add
 * their views here, keyed on the pilot's Corp Capabilities, without the route changing.
 */
export function srpViewFor(): SrpView {
  return 'member';
}
