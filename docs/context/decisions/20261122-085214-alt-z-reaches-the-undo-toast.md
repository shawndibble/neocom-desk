# Scope decisions — Alt+Z reaches the Undo toast (issue #6555)

_Recorded 2026-11-22 · issue #6555._

- **Alt+Z focuses the newest Undo toast's button; the 8s expiry stays.** The toast is portalled to the end of `body`, so Tab cannot reach it in time. Focus-within already holds the clock (`20261027-195313`), so a hotkey that moves focus makes Undo keyboard-reachable for its whole lifetime without stealing focus on mount or lengthening the timer. Alt+Z is not the browser's or an editor's native Undo (Ctrl+Z), so it never clashes with typing.
- **Bulk actions confirm or defer.** SRP bulk Approve and Mark paid ask first; Alerts Mark all read is one deferred-commit Undo; Mail Reply/Forward Cancel asks once the pilot has edited; group Auto Build says how many plans changed, or that none did.
