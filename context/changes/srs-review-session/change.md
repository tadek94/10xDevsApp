---
change_id: srs-review-session
title: Sesja powtórek SRS — roadmap S-03 (north star, część końcowa)
status: implementing
created: 2026-06-05
updated: 2026-06-05
archived_at: null
---

## Notes

Implementuje slice **S-03** z `context/foundation/roadmap.md`: zalogowany użytkownik uruchamia sesję spaced repetition na zapisanych fiszkach; karty pojawiają się w kolejności wyznaczonej przez algorytm SRS, a wyniki zapamiętywane są do następnej sesji (PRD: FR-009, FR-010). Prerekwizyty F-01 + S-01 są `done`.

**Blocker do rozstrzygnięcia przed planem:** Open Roadmap Question #2 — wybór biblioteki SRS. Kandydaci: `ts-fsrs` (SM-2/SM-5, TypeScript-native) vs prosty harmonogram interwałowy (1d→3d→7d, zero zależności). Decyzja determinuje schemat pól SRS (interval, ease_factor, due_date) w kolejnej migracji oraz architekturę S-03.
