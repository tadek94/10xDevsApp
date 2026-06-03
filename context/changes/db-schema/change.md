---
change_id: db-schema
title: Flashcard schema and RLS migration in Supabase
status: impl_reviewed
created: 2026-05-28
updated: 2026-06-03
archived_at: null
---

## Notes

F-01 from roadmap. Creates the `flashcards` table (id, user_id, front, back, created_at, updated_at) with per-user RLS policies. Unlocks S-01, S-02, and S-03.
