# Scope decisions — Overview widgets carry no New tag

_Recorded 2026-10-11._

- **No widget or Gallery entry carries a "New" tag, and the Gallery has no
  "Recently added" filter.** The widget grid replaced the card board in one
  release, so every widget is new to every pilot and the tag says nothing. The
  flag was a hardcoded per-kind `isNew` with no expiry and no seen state, so it
  would have stayed on until someone edited the code. It also showed only to
  pilots who had customised the old board. Rules out: re-adding a tag without a
  lifetime (seen state or a date) and a reason a pilot would act on it.
