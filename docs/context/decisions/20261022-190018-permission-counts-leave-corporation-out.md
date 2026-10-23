# Scope decisions — Permission counts leave Corporation out

_Recorded 2026-10-22._

- **The "n of N" Permission count leaves Corporation out, everywhere it is shown (Settings › Permissions Character strip, the rail's Character switcher).** Settings › Permissions hides the Corporation row for a Character with no Corp Role, so counting it showed a fully granted pilot "1 missing" with nothing to grant. Knowing who holds a Corp Role takes an ESI call per Character, which the counts must not make, so Corporation is dropped from the count rather than counted per Character. Accepted cost: a Character with a Corp Role who hasn't granted Corporation reads complete in the count; the Missing Corporation row in its own Permissions panel is where that shows. The Customize Permissions dialog still lists and counts Corporation, since it is a choice there.
- **The rail's Character switcher icon carries no warning dot.** The "n of N" in its list already says what is missing; a standing badge on the nav for an optional Permission read as an alert the pilot had no reason to act on.
