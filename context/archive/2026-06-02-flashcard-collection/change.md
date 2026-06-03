---
change_id: flashcard-collection
title: Kolekcja fiszek — lista, ręczne tworzenie, edycja, usuwanie
status: archived
created: 2026-06-02
updated: 2026-06-03
archived_at: 2026-06-03T12:50:04Z
---

## Notes

Roadmap S-02 (`flashcard-collection`). Outcome: zalogowany użytkownik może zobaczyć
swoje fiszki jako płaską listę, stworzyć kartę ręcznie (front + back), edytować
dowolną zapisaną kartę oraz usunąć kartę po potwierdzeniu.

- PRD refs: FR-005, FR-006, FR-007, FR-008
- Prerequisites: F-01 (db-schema) — gotowy
- Guardrail PRD: każda operacja zapisu musi przeżyć przeładowanie strony (weryfikować przez reload).
- Niskie ryzyko techniczne (standardowy CRUD + Supabase RLS).
