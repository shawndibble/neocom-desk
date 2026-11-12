# Vetting mockups (no issue yet)

Stories: `mockups/VettingApplicant`, `mockups/VettingReview`. Design under discussion: a one-time,
server-verified read of a pilot's characters (the corp keeps no sign-in), flags for a recruiter,
and sign-offs. Covers a new applicant and a member's review before a promotion.

| Screen | Files (`-1440` / `-390`) | Shows |
|---|---|---|
| Apply link | `applicant-start`, `applicant-characters` | Public page, no account: how it works and what is shared before the sign-in; character list with a "Part missing" row; all-my-characters statement |
| Status page | `applicant-sent`, `applicant-accepted`, `applicant-status-in-app` | Where Send lands: status, what happens next, who opened the report, Withdraw, optional "Open Neocom Desk with these characters"; accepted state with the in-game step; the same page in the shell for an existing pilot |
| Promotion request | `applicant-promotion` | In the app: who asked and for which role, characters already signed in ticked, Share or Decline |
| Queue | `review-queue`, `review-empty` | Applications and promotions in one list, result in words, sign-offs with "Yours needed" |
| Report | `review-flagged`, `review-nothing-found`, `review-promotion` | Result line, flags with the rows behind them, could-not-check, checks that found nothing, decision rail; promotion adds "Since the last review", "In this corp" and two sign-offs |

## Choices to confirm

- **No "safe".** Three results: flags found, nothing found (neutral, with the count of checks), incomplete.
- **No Accept or Reject in the queue.** A row click opens the report; the decision is made there.
- **Mail is who and subject, never the body.**
- **The second reviewer does not see the first decision** until they record their own. Whoever asked for a promotion review cannot sign it off.
- **Send lands on the status page, not Overview with a toast.** Staying signed in is opt-in and device-only.
- **The pilot sees who opened the report** and can withdraw; the report is deleted 30 days after the decision.

## Mobbin references

- Consent before connecting: [Quicken](https://mobbin.com/screens/786fc294-e518-4b79-8185-95183f068244) (data accessed / kept private / you're in control), [QuickBooks](https://mobbin.com/screens/c0a2fa94-fa33-4847-acf5-f7cbbef19cb1) (numbered steps first), [ChatGPT](https://mobbin.com/screens/793f39a7-9735-4c45-ae4e-a7f20229580f) (risk said plainly).
- Criterion with its evidence: [Juicebox](https://mobbin.com/screens/e19baf87-c4dd-4dbf-820c-6b2e61fd0b1c) (profile, why it matched, decision rail), [Pin](https://mobbin.com/screens/8d884daa-d283-41a7-ad45-342d18e5c433) (one sentence per check).
- Approvals: [Aboard](https://mobbin.com/screens/5a056ef3-207c-4aec-a921-03eb98ee2788) (next approver in the list), [Canva](https://mobbin.com/screens/476563dd-d2bd-418e-8ddf-8ba75b6130c8) (reviewers column), [Whop](https://mobbin.com/screens/4ebc9b40-33f8-4c0a-bd3a-f64f44c10825) (case timeline).

Not drawn: an Overview entry for an existing pilot's application, the Decided and Watchlist tabs, the Reject, Object and Decline dialogs, "Review a member…",
and the Vetting nav item (the shell shows no rail in these stories). The phone promotion request shows the
shell's sample broker-fee banner, which is not part of the proposal.

First draft mockup; sample data. Names ("Vetting", "flag", "sign-off") are working terms, not yet in `GLOSSARY.md`.
