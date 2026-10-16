# Scope decisions — Boot no longer waits on the update check

_Recorded 2026-10-16._

- **Boot applies a build that is already waiting, and never waits on the network to look for one.** Supersedes the "Boot holds the loading screen on the update check, capped at about 3.5 s" bullet of `20261015-152345-boot-applies-a-waiting-update-never-mid-session.md`. With a worker controlling the page and nothing waiting, boot fires `registration.update()` and renders on the first frame. A build the check finds installs in the background and is applied by the next cold start or reload. Waiting up to 3.5 s on every load, for a build that is rarely there, cost more than it bought.

- **Trade-off, accepted: a deploy reaches a visitor one load later.** The load that finds a build is not the load that runs it. A build already waiting (found by the previous load, or by `ReloadPrompt`'s 5-minute and on-resume checks) still swaps behind the boot screen, with the same 30 s loop guard.

- **Unchanged:** the swap path, the loop guard, the hard-reload settle (`settleWorker`, still bounded by the 3.5 s cap, after the first frame and never holding the page), the `/callback` and public-link-route skips, and Settings → "Update now".
