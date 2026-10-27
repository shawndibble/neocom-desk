# Scope decisions — Pilot Lookup Local list groups pilots by kills in the space you are in

_Recorded 2026-10-08. Supersedes the danger/gang table and "default sort is danger" of `20261007-224716`._

- **The question is "can I ignore this pilot here?"** The Local list answers it from where and how recently a pilot has killed, not from all-time danger and gang ratios. Those two stay in the pilot's modal.
- **Groups, in this order:** red and orange contacts; killed in the kind of space you are in (last 30 days); killed elsewhere (last 30 days); no kills in 30 days; not checked yet; friendly. Names state a condition, never a verdict (`20260912-172628`); the internal id for the first group is `marked`, not a word the copy test forbids.
- **Friendly means** your own corporation or alliance, or a blue (+5 and above) contact. It sits last and collapsed. Your own organisation beats a contact on the same pilot; a red or orange contact beats anything they have killed. A neutral (0) contact stays in the activity groups.
- **Standing is drawn with the Contacts page's `StandingIcon`**, not words, so a tier reads the same everywhere; its tooltip names whose contact it is.
- **Standing comes from your own contact list only.** A pilot's own contact wins, then their corporation's, then their alliance's. Corporation and alliance contact lists need their own scopes and a fresh login, so they are not read. Without the contacts scope the standing column is simply empty.
- **Kills are counted per kind of space** (high, low, null, wormhole) from zKillboard's `loc:` label on one kills list per pilot (its first page, up to 200). Each space shows its 30-day count and the age of the newest kill in it, faded once older than a day and again past a week. Losses are not fetched for the list.
- **Friendly pilots are not looked up** at all, which also keeps the zKillboard fan-out down.
- **"Here" is the Character's Current System** (`useCurrentSystem`: ESI location, or a system picked by hand). Changing it is a small button under the name box and never waits for ESI. A pick made before ESI answered holds until ESI reports a different system than its first answer.
- **The name box takes one name per line.** Enter looks up a single name, Shift+Enter starts a list, and once there are two lines Enter adds a line and Ctrl/Cmd+Enter looks the list up. On a touch device Enter always adds a line. Suggestions follow the line the caret is on; picking one fills only that line.
- **A pilot's name is the standard character link** and opens Show Info, not the one-pilot page. Rows are no longer clickable, so a row has one action.
- **Fleet membership is not shown.** It needs a fleet scope that is not granted today.
- **The modal's "Where they kill"** (30-day counts per space, a labelled six-month chart, ships they killed) lives in `PilotProfileView`, so Show Info's Character tab shows it everywhere, not only from this list.
