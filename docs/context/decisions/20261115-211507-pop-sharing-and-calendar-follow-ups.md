# Scope decisions — Pop Sharing and Calendar follow-ups

_Recorded 2026-11-15._

- **A chunk fractured early is told after the fact, as "Fractured early".** The book learns the laser shot only at its next sync, so the moved Pop Time is already past and no window crosses it. A pop whose time moved earlier to one already past fires once, up to 12 hours after the fracture (one book sync, with margin; the belt lasts 48 hours). Republishing the book deletes every device's unfired Scheduled Push for the old time, since a closed app never uploads the Projection that would replace it.
- **A Community's admin lists sharers from the settings, not the published pops.** A corporation stays listed (and blockable) between extractions, and is marked Not showing while no officer of its book is a Member there (the officer rule).
- **The book's alliance is read at view time from a Character in its corporation** (a viewer, else an officer the read already looks up), so a book that left its alliance stops showing there at once. With no such Character, the alliance last published stands.
- **A book that shares nothing marks nothing.** The opted-out mark on the moon lists shows only while Pop Sharing is on; off, it was noise. The Sharing tab's own rows still show it.
- **The Coming Up rail folds items overdue for over 2 days into one summary row** ("Overdue over 2 days · oldest N days", with the count) that expands in place. Recently overdue items stay as they are; a picked day folds nothing. (Superseded: it now folds everything overdue from before today; see the Calendar fold decision.)
- **"Today" on the Calendar Map stays as `20261022-101910` set it**: the Time format's day (a UTC day with `eve`, the pilot's own with `local`). Not changed here.
