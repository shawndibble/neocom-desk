# Scope decisions — Mail push shows sender and subject, the synced feed row never does (issue #5143)

_Recorded 2026-10-25 · issue #5143._

- **The pop-up names the sender and subject; the app's own wording did not.** The ticket asked the push to match the in-app wording "sender name + subject", but `newMail`'s Foreground Poller copy is only "{{character}} has new mail." (the diff's fire carries a mail id, not a sender or subject). A bare "has new mail" push is of little use, so the closed-app pop-up is richer than the open app's. The shared `newMailText` (`serverEventCopy.ts`) renders both, so the poller's wording is its no-sender, no-subject form. The open app's own pop-up is unchanged.
- **The feed row is filed with the plain line.** The Notification Feed syncs to Firestore, so a sender or subject in a pushed row's body would put mail content on our server. The service worker therefore shows the rich body on the pop-up and records the plain one in the feed row. The only place a subject travels is the push itself (FCM).
- **Sender names resolve in the worker**, through public `/universe/names` as ship-lost names do. A mailing list or an unresolvable id is left out, not guessed.
- **A burst pushes at most the newest 5 mails per device per run**; the rest are consumed and reach the Alerts list when the app next opens. One push per mail for a 40-mail backlog would be a flood.
- **Not content-filtered.** Like `diffNewMail`, any header above the mark that the Character did not send itself fires, whatever its labels or read state.
