# Raids hunter widget options (#4781)

Part of #4781. Research and mockups only; nothing is built. Sample data: a pilot in Efa, a few nullsec skyhooks. Story ids: `mockups-raidshunter--option-a-wide`, `-option-a-phone`, `-option-b-wide`, `-option-b-phone`, `-option-c-wide`, `-option-c-phone`, `-states-wide`, `-states-phone` (source `src/mockups/RaidsHunter.stories.tsx`).

## Recommendation

**Do not build a separate `raids` widget. Build option B: give Skyhook raids (`sovRaids`) a "Where" setting, My alliance / Near me, with a jumps radius under Near me.** Option C (Route Safety rows plus the #4833 alert only) is the fallback if even that is more than the hunter case is worth.

Why, with evidence:

1. **It is the same read.** `sovRaidsLoader.ts` already fetches the whole `GET /skyhooks/raidable` list and the `/sovereignty/systems` claims, then cuts the list to the Character's alliance. Near me is a different cut of the same two reads plus `jumpsFromCurrent`, which also exists. A second kind would duplicate loader, model, copy, gallery sample and tests for a filter.
2. **The member-only widget fails the people a hunter widget is for.** `sovRaids` shows "no alliance" or "no sov" as its empty state. A raider is typically in no sov alliance, so today the widget is blank for exactly them.
3. **The public data is thin, so the widget is thin.** The list carries system, planet and a window, nothing else (no silo, no stock, no owner). The owner comes from the claim join. What a hunter most wants (how much is in the surplus bay) is not public. A whole widget kind for system, window, jumps and holder is a Table with four columns, which a setting delivers.
4. **The game already shows a list.** The Agency's Colony Resources page lists "Upcoming Raidable" (within two hours) and "Raidable Skyhooks" (now), and the map has a Vulnerable Skyhooks filter (EVE University wiki). What the game lacks, and this app can add, is distance from where you are, the holder, and a place on the Overview beside the rest of your day.
5. **Dashboard slots are not free.** A rarely-used second kind is Gallery and layout clutter; a setting costs one menu section.

Decisions the build ticket needs (see "Open questions"): colour framing flips by role, the radius is not a Range, and the Number's secondary line.

## Today vs proposed

| | Today (`sovRaids`, #4798) | A: second widget `raids` | B: Where setting (recommended) | C: Route Safety only |
|---|---|---|---|---|
| Who it serves | Alliance members, defender | Raider | Both, one widget | Raider on a route |
| Scope | Own alliance's space | Within N jumps of Current System, any holder | Either, per widget | Systems on the saved route |
| Columns | Skyhook, Window, Jumps | Skyhook, Window, Jumps, Held by | Same, plus Held by when Near me | System, Condition, Jump |
| Setting | none | Radius (jumps) | Where, Radius | none |
| Signed-out of alliance | Empty "no alliance" | Works | Works (Near me) | Works |
| New code | none | New kind, loader, model, copy, gallery sample | One filter, two settings, one column | #4833 already building |
| Answers "where do I go hunt" | no | yes | yes | no, only "is my route near one" |

Screenshots: A `option-a-wide-1440.png` / `option-a-phone-390.png`; B `option-b-wide-1440.png` / `option-b-phone-390.png`; C `option-c-wide-1440.png` / `option-c-phone-390.png`; states `states-wide-1440.png` / `states-phone-390.png`.

## What a raider decides on

Ranked by what the evidence says matters, and whether the public list can answer it:

| Question | Answerable now? | Shown as |
|---|---|---|
| Is it open now, or when does it open? | Yes (`theft_vulnerability`) | Window column: "Open, closes in 38m" / "Opens in 1h 12m" |
| Can I get there in time? | Derived (jumps; theft needs a 10 minute link) | Jumps column; an open window under 10 minutes is toned caution |
| How far? | Yes (jumps from Current System) | Jumps column, default sort key after state |
| Who holds it, and is it mine? | Yes (claim join) | Held by column; own alliance marked "Your alliance" |
| How much can be stolen? | **No** (no silo/stock in the public list) | Not shown; never a placeholder that implies a number |
| Space type and security | Mostly constant: skyhooks sit in player-owned sovereign nullsec (wiki) | No column; lowsec/nullsec distinction is moot |
| Is the route safe? | Separate widget | Option C's Route Safety row |

Mechanics that shape the rows (sources below): the window is one hour per CCP's FAQ, two hours per the EVE University wiki (the app reads whatever ESI sends, so the mockup says nothing about length); the theft link takes 10 minutes after the silo is shot to 10% shield; starting a theft alerts the system immediately, one jump out after 2 minutes, two jumps after 5; the whole surplus bay drops. So hunting is a timed, contested trip: jumps and time left matter more than anything else public.

## Sort, filter, radius, empty states, countdowns

- **Default sort:** open now first, then soonest opening; ties by fewer jumps. Every column sortable (as `sovRaids` today). Not distance first: a near skyhook that opens in six hours is less useful than a far one open now.
- **Filter:** none in the widget. The radius is the filter. No "hide own alliance" toggle: "Your alliance" is a word in the Held by cell, and the row stays so the list is complete.
- **Default radius:** 8 jumps (the ticket's example). Choices 5, 8, 10, 15. Beyond the radius the table footer says "1 more beyond 8 jumps", so a hunter knows the list was cut (the footer slot already exists, e.g. "38 of 49 slots").
- **Countdowns:** the house convention in `sovRaidsModel`: words with the clock ("Open, closes in 38m"), never colour alone; under the read's freshness window it reads "under 10m", not a minute count. The rolling list only reaches a few hours ahead, so an empty list says that.
- **Empty states** (`states-*`): none within radius (widen or check back); location unknown (jumps need the Current System, nothing is guessed); stale empty (age stated, nothing reloads on its own). All reuse the shell's empty state.
- **Colour framing (decision):** in `sovRaids` an open window is red because it is a threat. For a raider the same fact is an opportunity. In Near me the open window is green with the words "Open", and a window nearly shut is amber. A hunter widget and a defender widget on one Overview would then disagree in colour about the same skyhook; the words carry the meaning and the colour follows the role of the widget's scope.
- **Phone:** the table keeps every column and scrolls sideways (DataTable convention); on 390 "Held by" runs off the edge, so the build should give it the lowest column priority. Phone is for routes and pilot lookups, so the Number view is the phone-first surface.

## Research findings

CCP and community sources (no third-party skyhook tracker turned up in search; see "Honest gaps"):

- Windows: the next window is 72h plus a random offset (3h standard deviation) from the reinforcement timer; a skyhook stays raidable one hour once the window opens. https://www.eveonline.com/news/view/skyhook-enhancements-live-now-faq
- Visibility: vulnerable skyhooks show in the Agency and on the map; owner-corp members with roles see timers in the structure browser; outsiders must warp to an invulnerable skyhook to see its timer. Same FAQ.
- Loot: output splits 50/50; the Secure Bay (owner and access list) is safe, the Surplus Bay drops entirely, 100% drop rate, in a raid. https://www.eveonline.com/news/view/equinox-update-enhanced-skyhooks
- Mechanics: placement only in player-owned sovereign nullsec; link after silo reaches 10% shield; 10 minutes to complete; one ship linked at a time; system alerted at once, one jump after 2 minutes, two after 5; needs a cruiser or larger or an Upwell hauler, Omega clone; unraided surplus rolls over to 6-8 days of production. https://wiki.eveuniversity.org/Orbital_Skyhook
- Finding them in game: Vulnerable Skyhooks map filter; Agency Colony Resources with "Upcoming Raidable" (within two hours) and "Raidable Skyhooks". Same wiki page.
- ESI: "a rolling list of Skyhooks across New Eden that are either becoming raidable or are currently raidable"; sovereignty systems join structures and claims in one response. https://developers.eveonline.com/blog/equinox-on-esi-structures-sovereignty-and-access-lists (the post names no fields; the public/role question is answered by the repo's own #4798 loader, which reads both without a token).

Honest gaps: searches for Reddit and forum threads, dotlan, eve-ref and other trackers returned only CCP pages, so I cannot cite what players say is missing. The "no silo size" gap is inferred from the ESI shape, not from player complaints. Treat the sort order and the 10-minute caution as design proposals to test with Shawn, not findings.

## Mobbin patterns (what they showed, what applies)

Mobbin has nothing for a game-companion radar, so these are adjacent patterns. Searches: "nearby items with distance and countdown" (web), "upcoming and live events with countdown" (iOS).

- Live above upcoming, with a LIVE marker: Luma https://mobbin.com/screens/01732b58-0dc7-4c31-9965-6002f42611fa and Meta Quest https://mobbin.com/screens/e8e5310d-d6f5-4a34-8de7-77576ff8a9b1. Applies: open-now rows sort first with the word "Open", mirrored by the default sort. A badge pill is not needed; the Window cell already says it.
- Ongoing / Upcoming split with an "Ends in" countdown: Binance https://mobbin.com/screens/988dcb24-6895-494a-bcea-949ef04fe99e. Applies in spirit (closes-in for open, opens-in for upcoming). Does not apply: tabs and a segmented countdown; the table stays one list.
- Nearby list with the distance right-aligned: Walmart https://mobbin.com/screens/839877be-97b0-493a-ad46-7939f472128e. Applies: Jumps as a right-aligned numeric column (matches `sovRaids`). Does not apply: cards with phone numbers and addresses.
- Today / Upcoming grouping: Apple Sports https://mobbin.com/screens/7c3af29f-79f0-439c-9716-6900d5bf8f46. Does not apply: the list is only a few hours deep, so day groups would be empty.
- Stat number with a secondary line: not found as a distinct Mobbin pattern; the repo's Number view already is this, so the Number mockup reuses it ("4 raidable within 8 jumps" over the soonest line).

## Constraints respected

Desktop-first beside the EVE client, phone for routes and lookups only. No hidden rule or "feeder" wording in any copy. No assumption of Jita or frequent trips: the radius is jumps from wherever the Character is. Copy is in the mockup as sample text; the build owns `travel.sovRaids.*` keys.

## Open questions

1. **The radius is not a Range.** `WidgetRange` is days (7, 30, 90) and the menu's Range group says "days". A jumps radius needs its own setting field, migration (`layoutStore`) and menu group; the ticket's "Range setting like the other ranged kinds" is not literally available. Cheap, but not free.
2. **Origin:** Current System (as `sovRaids` jumps do today) or Home? The mockup uses Current System. If location access is missing the widget says so rather than guessing.
3. **Jumps basis:** `jumpsFromCurrent` uses the Route Safety jump basis; confirm that is the one a hunter expects (shortest, not safest).
4. **Own alliance in Near me:** shown and marked, or hidden? Shown here.
5. **Colour by role** (above): confirm green for open in Near me.
6. **Window length:** one hour (CCP FAQ) vs two (wiki): irrelevant to the widget, which reads ESI, but copy must not state a length.
7. **Option C duplication:** #4833 builds the alert and Route Safety rows regardless; if only those ship, "where do I go hunt" stays unanswered.
