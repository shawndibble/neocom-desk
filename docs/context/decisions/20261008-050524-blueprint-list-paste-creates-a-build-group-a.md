# Scope decisions — Blueprint list paste creates a Build Group; a repeat paste reuses it (issue #2982)

_Recorded 2026-10-08 · issue #2982._

- **A repeat paste reuses the group, it does not ask or duplicate.** If a Build Group's plans cover exactly the pasted blueprints, the pilot is opened onto it with a notice. The router acts on pastes nobody aimed at a field, so a repeat is more likely an accident than a wish for a twin, and a confirm step would break the router's no-confirm rule. A group the pilot has since edited no longer matches and a fresh one is made.
- **Blueprint lists outrank the Appraisal, below fits, chat links and D-Scans.** A strict majority of lines being blueprints or reaction formulas (copy/original markers ignored) is what makes a list one; a mixed list stays an item list. Unbuildable blueprints (invention, research, copy-only) are counted in a notice, never silently dropped.
