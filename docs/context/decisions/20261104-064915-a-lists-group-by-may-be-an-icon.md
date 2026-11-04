# Scope decisions — A list's Group by may be an icon menu on a phone

_Recorded 2026-11-04._

- **Below `sm`, a list's Group by may be an icon-only `IconButton` (`Icon.GroupBy`) opening a radio `DropdownMenu`, an exception to "Header controls" rule 1 (a mode control keeps its visible label at every width).** The owner asked for it on the Skill Plan entry list: on a phone the labelled "Group by" select pushed it and the Columns picker onto a second line under the search box. The trigger's accessible name and tooltip carry the current choice ("Group by: Priority"), so the mode is still announced and readable on hover or long-press. From `sm` up the labelled control stays. It rules out dropping the label anywhere else: a page header's scope or mode control, and Pilot Lookup's Group by `SegmentedControl`, still keep their words at every width.
