# Scope decisions — A toast whose clock runs out fades away; every other close stays instant

_Recorded 2026-11-27._

- **Expiry plays a 150ms exit: the toast drops 8px and fades (`--motion-quick-exit`,
  `--motion-ease-in`), then closes.** This supersedes "the absent exit animation" kept in
  `20261125-221326`. A toast that blinked out on its own read as a glitch mid-read, and toast
  open/close is one of the recipes `20261125-230821` lists as wanted.
- **Only the timer plays it.** Escape, the close button, Undo and a route change are the pilot's
  own actions, and a fade would hold up what they asked for, the same reason a menu closes at once.
- **Reduced motion gets none.** The `toast-out` rule sits under `no-preference`; with no animation
  to wait for, `Toast` closes at once.
- **No reflow animation in `ToastStack`.** The stack is anchored at the bottom and the oldest
  toast (the top one) expires first, so nothing under it moves. A toast held by hover and so
  outliving a newer one can still leave a gap that closes at once; that rare case is not worth a
  FLIP layer.
