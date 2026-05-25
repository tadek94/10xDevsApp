# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always Set a Kill Date on Feature Flags

- **Context**: Planning & implementation phases — any point where a feature flag is introduced.
- **Problem**: Flags accumulate and are never cleaned up; dead flags litter the codebase and block future refactors.
- **Rule**: Feature flags should always have a kill date. Record the date (or milestone) at the time the flag is introduced — not as an afterthought.
- **Applies to**: plan, implement, impl-review
