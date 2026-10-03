# Scope decisions — Route Safety edits Travel Settings in place (issue #2472)

_Recorded 2026-10-03 · issue #2472._

- **Route Safety's Route rules panel edits the pilot's synced Travel Settings,
  not a page-local copy.** A pilot planning a trip wants to change what it
  avoids without leaving for Settings → Travel and back. A copy of the rules
  that only this page obeyed would quote one jump count here and another on
  Assets, Courier and every other page for the same trip, which is exactly
  what Travel Settings exist to prevent. So the panel writes the same stores
  through the same controls (`features/route/TravelRuleFields.tsx`), shared
  with Settings → Travel so the two cannot drift apart.

- **Two labelled groups say what each control reaches.** "This route only ·
  kept in the link" holds the Route Preference, which on this page writes the
  URL's `pref` and never the saved default. "Your travel settings · used
  everywhere the app counts jumps" holds the security penalty, the EDENCOM,
  Triglavian and pod-kill rules, and the Avoided Systems. A pilot who changes
  the second group from a route page must be told it changes every page.

- **The security penalty follows the page's own Route Preference.** Under a
  link's Prefer shorter it is disabled, with the same note Settings shows,
  even when the saved default is Prefer safer: the penalty does nothing to the
  route on screen.

- **Avoid from a row previews before it saves.** The preview routes locally
  with the candidate avoid list passed explicitly, keeps the page's preference
  and penalty, and persists nothing. It states the new jump count, the change
  and the lowest security — conditions, never a verdict (decision
  `20260912-172628`). Avoidance is a cost, never a wall, so a trip only
  possible through the system still crosses it; the preview says "+0" and
  that there is no way around, rather than implying the avoid worked. The
  route's two ends offer no Avoid, and neither does a system already on the
  Avoided Systems with the switch on (nothing to add). A system avoided only
  by the EDENCOM, Triglavian or pod-kill rules still offers it: those rules
  can be switched off, the list entry stays.

- **With the Avoided Systems switch off, the preview counts it switched on.**
  Adding to a list the routes ignore changes nothing, so the dialog says the
  switch is off, previews with it on (which brings in every system already on
  the list, not only the new one), and offers "Switch on and avoid" beside a
  plain add.
