# Scope decisions — Late notices ship with no older-client support

_Recorded 2026-11-21. Owner's decision; replaces the legacy mirror and the soak of decision 20261120-235011._

- **The rules, the functions and the client deploy together, and an older tab is not served.** Few
  pilots use the book and they reload at once, so the server keeps no path for a tab older than
  this change. It rules out the `statements` / `statementLinks` mirror of every Late notice, the
  read fallback to those collections, and the "after the soak" follow-up that would have removed
  them.
- **The legacy notices are copied once.** A one-time copy moves each `statements` notice into
  `lateNotices` and each `statementLinks` token into `lateNoticeLinks`, and deletes the retired
  `minerTotals` docs. No server read looks at the legacy collections after it, and the rules no
  longer grant any read of them. A verify link already mailed keeps working: its token names the
  same notice id.
- **The older wire is gone.** `issueStatement`, `settleStatements`, `recordMail` and the
  `switchToRunningAccount`, `cadence` and `minimumStatement` settings are refused or ignored;
  `closeAccount` takes its final notice only as `notice` (a `LateNotice` under `finalNoticeId`).
  Kept, because the current client or mail already sent reads them: the verify wire field
  `statement`, the callable `readCorpTaxBookStatementCallable`, the `statementId` field a
  declaration and a token name their notice by, `finalStatementId` on a closed Miner, the
  `day-on-statement` rate refusal, and the audit action names older entries carry.
