# Simplify the main screen (T25)

## Why

**Problem.** Every feature is there, but daily use feels dense and overwhelming. On
the owner's laptop (1536 × 730 viewport) the route map is 23–43 % of the screen,
with the header and two rows of equal-weight metrics above it. The daily challenge
shows seven controls per problem. The review queue renders as broken columns, and
badges explain nothing. Measurements are in `docs/review/2026-10-28-app-review.md`.

**For whom.** A job seeker practising most days for an interview weeks or months
away. They open the app wanting one answer: *what do I do now?*

**Success criteria.**
- The map SVG is at least 60 % of the viewport height on desktop (1366 × 768 and up)
  with no panel open, and the page still never scrolls.
- The main screen shows at most 3 metric chips, chosen by urgency for this user.
  Everything else is one click away in Progress.
- Each daily-challenge item has exactly two buttons, Give feedback and Skip for
  24 hours, on one row.
- At 1366 × 768 the daily challenge with 4 items has no inner scrollbar.
- There is one entry point for a mock interview, on the main screen. A mock runs
  30 min for 1 problem, and 60 min (2 Easy) or 90 min (otherwise) for 2.
- The review queue is a readable full-width list.
- A first-time user gets a three-step welcome, once.

**Hard constraints.**
- There is no schema change and no Dexie version. The one new setting is a plain
  `settings` row.
- The pure rules stay deterministic and unit-tested (`mockMinutes`,
  `focusMetrics`), with dates passed in.
- `Overlay.tsx` stays the single modal shell.
- All animation sits behind `prefers-reduced-motion`.
- No new dependencies.

## Design

- **Header:** a single row: the title, a compact level chip, a "Badges n/N" chip
  that opens Progress, and Settings.
- **Focus strip:** one row: up to 3 chips from `focusMetrics(...)`, then the actions.
  - Today's challenge is the primary action. Reviews (N) and Mock interview follow,
    with Mock carrying the due or running state.
  - Search sits on the same row.
  - Chip priority:
    1. A running mock.
    2. Owed reviews, marked urgent when new problems are paused.
    3. The streak, marked at risk when nothing has been logged today.
    4. A deadline that no longer fits.
    5. Readiness.
    6. The finish forecast.
- **Progress overlay:** all secondary metrics plus the badge grid. Each badge is
  focusable and shows a hover/focus card.
- **Map:** the heading folds into one small line and the SVG takes the rest. `main`
  widens to 96 rem.
- **Daily challenge:**
  - The title links to NeetCode, with LeetCode as a small link.
  - Each item has two buttons.
  - Strategy and budget sit under a collapsed "Adjust today".
  - Quick-log leaves the card.
- **Review queue:** a full-width screen in place of the map, with compact rows and
  a Start button. Optional reviews are collapsed. The "Next review →" flow is
  unchanged.
- **Problem view:** while a problem is open, the focus strip and search hide on
  every width.
- **Welcome:** shown when `onboardingDone` is unset and there is no progress or
  attempt history. The steps are what the app does, then pick a list, then
  optionally mark known problems.
