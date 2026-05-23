---
project: "10xCards"
context_type: greenfield
created: 2026-05-21
updated: 2026-05-21
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 10
  gray_areas_resolved:
    - topic: "primary persona"
      decision: "Professionals needing recertification (doctors, lawyers, engineers)"
    - topic: "triggering moment"
      decision: "Sitting down with source material to study and wanting to create flashcards"
    - topic: "pain category"
      decision: "Workflow friction — method is known, setup takes too long"
    - topic: "insight"
      decision: "LLMs now make auto-generation good enough to trust; previous tools produced low-quality cards"
    - topic: "auth method"
      decision: "Email + password login"
    - topic: "role model"
      decision: "Flat — all users equal; no role separation in MVP"
  quality_check_status: accepted
---

## Vision & Problem Statement

Professionals who need to recertify — doctors, lawyers, engineers — know that spaced repetition works. When they sit down with a textbook or lecture notes to study, the obstacle is not motivation or method: it is the manual work of turning dense source material into flashcards before they can even start reviewing. That setup cost is high enough that most skip it, defaulting to less effective study habits.

The insight that makes this worth building: LLMs can now generate flashcards good enough to review and keep, not discard. Previous auto-generation tools produced cards too imprecise for professional-grade material. That gap has closed. 10xCards converts the copy-paste moment into a functional deck in seconds, eliminating the barrier between source material and review session.

## User & Persona

**Primary persona: The recertifying professional**
A doctor, lawyer, or engineer with active domain knowledge who must absorb new or updated material to maintain their certification or professional standing. Their study sessions are constrained — evenings, lunch breaks, commutes. They know spaced repetition is efficient, but every session they have spent so far building decks manually has felt like prep work that delays the actual learning.

They open a study session with source material in hand — a medical guideline update, a legal statute summary, an engineering standard — and want to be reviewing within minutes, not building for an hour.

## Access Control

Authentication: email + password. Standard sign-up and sign-in flow; users own their decks and data persists across devices and sessions.

Role model: flat. All authenticated users have identical capabilities in the MVP. No admin role, no team workspace, no sharing — every account is a private study environment.

An unauthenticated user who hits any gated route is redirected to the sign-in page.

## Success Criteria

### Primary
- 75% of AI-generated flashcards are accepted by the user (not deleted before the first review session).
- 75% of all flashcards in an active account are created via AI generation, not manually.

First-session flow that proves the product works:
1. User signs up
2. User pastes source text
3. AI generates a set of flashcards
4. User reviews, accepts, edits, or removes individual cards
5. User starts a spaced repetition session with the accepted cards

### Secondary
- User edits ≤ 25% of AI-generated cards before accepting them. Proxy for AI card quality — most cards are accepted as-is, with minor tweaks at most.

### Guardrails
- Card edits must persist reliably. No silent data loss: if a user edits a card and saves, the change must survive a page reload.

## User Stories

### US-01: User generates flashcards from source material

- **Given** a signed-in user on the flashcard generation screen
- **When** they paste source text and trigger AI generation
- **Then** they see a list of suggested flashcard pairs (front + back) that they can accept, edit, or discard one by one, and then save the accepted cards to their collection

#### Acceptance Criteria
- At least one card is generated for any text input of ≥ 50 words
- Each suggested card shows the front and back before the user commits
- Discarded cards are not saved; accepted cards persist after page reload
- The user sees visible progress feedback while the AI is processing

## Functional Requirements

### Authentication
- FR-001: Guest can create an account (sign up with email + password). Priority: must-have
  > Socrates: Counter-argument considered: "Defer sign-up; use a single hardcoded account to validate AI generation first." Resolution: kept. A web app with persistent user flashcard data needs accounts from day one — deferring would block the primary success metric (per-user card acceptance rate).

- FR-002: User can sign in and sign out. Priority: must-have
  > Socrates: No meaningful counter-argument. Sign-in/sign-out is a prerequisite of account-based persistence.

### Flashcard generation
- FR-003: User can paste source text and trigger AI-generated flashcard suggestions. Priority: must-have
  > Socrates: Counter-argument considered: "AI card quality for dense professional content (legal, medical) may be lower than expected — shipping before validating quality risks the 75% acceptance metric." Resolution: kept, but flagged as the highest-risk assumption in the MVP. The 75% acceptance metric is precisely the validation signal; if quality is insufficient, it will show up early.

- FR-004: User can accept, edit, or discard each AI-generated flashcard suggestion before saving. Priority: must-have
  > Socrates: Counter-argument considered: "Showing each card before saving is unnecessary if trust in AI is already high — defer to post-session review." Resolution: kept. Pre-save review is essential for the acceptance metric to be meaningful; users must consciously decide on each card for the 75% signal to carry information.

- FR-005: User can create a flashcard manually (front + back). Priority: must-have
  > Socrates: Counter-argument considered: "Defer to v2 — manual creation adds work without testing the AI-first hypothesis." Resolution: kept, but for a specific reason: manual creation is a safety net for when AI generation produces poor results on a given input. Without it, a failed generation session leaves the user with nothing. It is a resilience feature, not a feature for its own sake.

### Flashcard management
- FR-006: User can view their saved flashcard collection (flat list). Priority: must-have
  > Socrates: No meaningful counter-argument. Viewing the collection is table stakes.

- FR-007: User can edit a saved flashcard. Priority: must-have
  > Socrates: Counter-argument considered: "Heavy editing signals an AI quality problem, not a UX need." Resolution: kept. Edit is necessary regardless — even good AI occasionally produces a card that needs a minor correction. Editing frequency is a metric to monitor, not a reason to omit the feature.

- FR-008: User can delete a saved flashcard. Priority: must-have
  > Socrates: Counter-argument considered: "Deletion is irreversible in a flat list — accidental deletes lose study investment with no recovery path." Resolution: kept, with an implicit design constraint: the deletion flow must include a confirmation step to prevent accidental loss. Soft-delete can be considered for v2 if accidental deletion is reported.

### Spaced repetition
- FR-009: User can start a spaced repetition review session using their saved flashcards. Priority: must-have
  > Socrates: Counter-argument considered: "A review session on 3–5 cards is meaningless for spaced repetition." Resolution: kept, but flags a design constraint: the app should communicate clearly when the deck is too small for meaningful scheduling, and may enforce a soft minimum before a full session can start.

- FR-010: The app applies a ready-made spaced repetition algorithm to schedule future reviews. Priority: must-have
  > Socrates: Counter-argument considered: "A third-party SRS library is a dependency you can't control — a simple interval schedule (1d → 3d → 7d) may be more predictable for MVP." Resolution: kept. Using a proven SRS library is the right call for correctness. However, the specific library choice is deferred to tech-stack selection — this FR only requires that *an established algorithm* is used, not which one.

## Business Logic

The app extracts testable knowledge from source text and schedules it for review at the optimal moment for long-term retention.

Input: raw text the user pastes — a section of a medical guideline, a legal summary, an engineering standard. The user does not select what to extract; that judgment is the product's.

Output: a set of question-answer flashcard pairs, one per extractable fact or concept. The user reviews each pair and decides which to keep.

The user encounters the rule twice: first when the generation result appears (they see what the app decided was worth knowing from their source material), and again each time they open a review session (the app decides which cards are due based on their past recall performance).

## Non-Functional Requirements

- The user sees visible progress feedback within 2 seconds of submitting source text for generation; no blank screen or frozen UI while the AI processes the request.
- Each user's flashcards and review history are accessible only to that user; no cross-account data leakage under any request path.

## Open Questions

1. **Source text retention policy** — Do professionals who paste confidential material (patient notes, legal briefs, engineering standards) require a guarantee that the submitted text is not stored after card generation completes? Not selected as a guardrail, but the professional persona makes this a non-trivial privacy assumption. Owner: user. Block: no (product can ship without this commitment, but it should be an explicit decision before reaching professional users at scale).

## Non-Goals

- **No custom SRS algorithm** — the MVP uses an established spaced repetition library; no SuperMemo/Anki-level algorithm engineering. Rationale: building a proprietary algorithm is expensive and orthogonal to validating the AI generation hypothesis.
- **No multi-format import** — paste-from-text only; no PDF, DOCX, image, or file upload parsing in MVP. Rationale: document parsing adds significant implementation complexity and is a separate product surface from AI generation quality.
- **No shared decks or collaboration** — every account is a private study environment; no sharing flashcard sets between users, no team workspaces, no public decks. Rationale: sharing requires access control redesign and social features that are out of scope for a single-user validation.
- **No mobile apps** — web-only in MVP; no iOS/Android native app or mobile-optimized PWA. Rationale: mobile adds platform overhead before the core value proposition is validated on web.

## Product Framing (→ PRD frontmatter)

```
product_type:   web-app
target_scale:
  users:        small   (single-digit users at launch; handful of early adopters)
  qps:          low
  data_volume:  small
timeline_budget:
  mvp_weeks:    3
  hard_deadline: null
  after_hours_only: true
```


