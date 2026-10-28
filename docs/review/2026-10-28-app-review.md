# App review — 2026-10-28 (T25)

QA, UI/UX and regular-user review of `master` at `4c7a0d7`, run in Chromium against
`npm run dev` on a throwaway origin (`localhost:5199`, so no real data was touched).
Layout was measured inside a same-origin iframe sized to each viewport:
**1536 × 730** (the owner's laptop: 1920 × 1080 at 125 % minus browser chrome),
1366 × 768, 1920 × 1080 and 390 × 844. Two profiles: a fresh origin, and one seeded
through the real `saveAttempt` path (38 attempts over 30 days, 7 topics, 4 owed + 5
optional reviews). Screenshots are in `docs/review/2026-10-28/`.

Priority: **P1** blocks or badly hurts daily use · **P2** clearly worse than it should
be · **P3** polish.

## Measurements (main screen, no panel open)

| Viewport | Header | Stats row | Search | Map SVG height | SVG share of viewport |
|---|---|---|---|---|---|
| 1536 × 730, fresh | 208 px | 125 px | 44 px | 168 px | **23 %** |
| 1536 × 730, seeded | 67 px | 119 px | 44 px | 315 px | 43 % |
| 1366 × 768, seeded | 67 px | 119 px | 44 px | 352 px | 46 % |
| 1920 × 1080, seeded | 67 px | 119 px | 44 px | 664 px | 61 % |
| 390 × 844, seeded | 158 px | 278 px | 44 px | 312 px box, scrolls | 37 % |

The page itself never scrolls at any size (the invariant holds), but it holds by
squeezing the map. `main` is capped at 72 rem, so on 1536 and 1920 px the app is a
1152 px column with large empty margins.

## Findings

### Layout and density

1. **P1 — The route map is crushed by the header and the metrics.** At the owner's
   1536 × 730 the map drawing is 168 px tall on first run and 315 px later; labels
   render at ~7 px. Header (title, XP strip, 25-mark badge strip, problem-set
   banner, import offer, Settings) plus a two-line stats row with 6 metrics and 3
   buttons take 330–460 px before the map starts. *Fix:* one slim header row;
   badges and secondary metrics to a Progress overlay; a one-row focus strip
   (T25 step 4). (`01-first-run-1536x730.jpg`)
2. **P1 — Too many numbers, no hierarchy.** Day streak, grace days, weeks
   consistent, attempts in 7 days, readiness % and topics ready, finish forecast,
   goal line and XP (with multiplier) are all shown at once with equal weight. A
   daily user cannot tell what needs doing now. *Fix:* show at most 3 chips chosen
   by urgency for this user (`focusMetrics.ts`), everything else in Progress.
3. **P2 — The app is a narrow column on wide screens.** `main` caps at 72 rem, so
   384 px per side is empty at 1920. *Fix:* widen to ~96 rem.
4. **P2 — Phone: header + stats take 512 of 844 px**, and the stats wrap into four
   lines; the map is a 312 px box with its own scrollbar. (`05-phone-390.jpg`)
5. **P3 — Native white scrollbars** on the badge strip and the portrait map clash
   with the dark theme. *Fix:* themed thin scrollbars (`scrollbar-color`).

### Daily challenge

6. **P1 — Seven controls per problem, stacked over three rows.** Each item has
   Solve on LeetCode, Solve on NeetCode, three quick-log buttons, Give feedback and
   Skip for 24 hours; Give feedback and Skip sit in a right-hand column and wrap
   under each other. With only 2 items the modal body already scrolls (755 px in a
   495 px box). *Fix:* title links to NeetCode (small LeetCode link beside it),
   exactly two buttons on one row — Give feedback, Skip for 24 hours (T25 step 3).
   (`02-daily-challenge.png`)
7. **P2 — The plan header is busy.** Strategy line, six time-budget buttons,
   estimate and an instructions sentence sit above the first problem. *Fix:* move
   strategy and budget under a collapsed "Adjust today".
8. **P2 — Two ways into the mock interview** (header button and the plan's nudge
   button). *Fix:* the main-page button only; the nudge becomes its state.

### Review queue

9. **P1 — The review queue renders as broken side-by-side columns.** In the 26 rem
   side panel, both `<ol class="catalog-list">` lists (owed and optional) are
   forced into `grid-row: 2` of `.topic-panel`, so they land as two ~100 px wide
   columns with their own scrollbars, next to the backup reminder squeezed beside
   the heading. Titles wrap one word per line. *Fix:* a full-width review screen
   with one list per section and compact one-line rows (T25 step 5).
   (`03-review-queue.png`)
10. **P2 — Duplicate topic text in rows**: "Binary Search · Binary Search" (the
    primary topic followed by the topics list, which repeats it). *Fix:* show the
    primary topic only, plus extra topics when there are any.

### Problem view

11. **P2 — The problem view scrolls in a box under the full header and stats.**
    1319 px of content in a 419 px box at 1536 × 730; the header, stats and search
    stay visible above it although the view is meant to be "full screen". *Fix:*
    hide the focus strip and search while a problem is open on every width (today
    only on phones), and keep the actions on one row.

### Badges and gamification

12. **P2 — Badges have no hover affordance.** 25 1.25 rem marks with only a native
    `title` tooltip (slow, unstyled, absent on touch). Nothing tells a user what a
    locked badge needs. *Fix:* badge grid in the Progress overlay; hover/focus
    shows a card with name, how to earn it, earned/locked.
13. **P3 — XP strip wraps awkwardly** at 1536: "×1.25 XP" chip, "328 / 350 XP to
    level 4" breaks over two lines inside a 140 px box. *Fix:* compact level chip.

### Mock interview

14. **P2 — Timing and counts don't match how interviews run.** 15/25/40 min per
    Easy/Medium/Hard and 1–3 problems. *Owner's rule:* 1 problem = 30 min,
    2 problems = 60 min when both are Easy, otherwise 90 min; no 3-problem option.

### Settings

15. **P2 — Settings is one 2 695 px scroll** in a 495 px box: ten cards (problem
    set, weekly goal, interview deadline, skip Easies, calendar reminder, storage,
    export, restore, import history, reset) with no grouping. *Fix:* group into
    "Plan", "Reminders" and "Data" sections with headings, tighter cards.

### First run (regular user)

16. **P1 — No onboarding.** A first-time user lands on a crowded screen with an
    inline "Which list are you working through?" picker and an import offer inside
    the header, and no explanation of the map, the daily challenge or reviews.
    *Fix:* a three-step welcome (what it is → pick a list → mark known problems),
    shown once (T25 step 6).
17. **P3 — The primary action isn't primary.** "Today's challenge" is styled like
    the other outline buttons; a new user's first job is to open it. *Fix:* filled
    primary button.

### QA

- Flows exercised: first run, problem-set pick, daily challenge open/close, mock
  setup, settings, review queue → problem → back, search. No console errors.
  Page scroll stayed 0 in every state.
- No functional regressions found beyond the rendering bugs above.

## Resolution (final QA pass, same day)

| # | Finding | Fixed in |
|---|---|---|
| 1, 2, 3, 4, 5, 13, 17 | Map crushed, flat metrics, narrow column, phone chrome, white scrollbars, XP strip, primary action | #30 |
| 6, 7 | Daily-challenge controls, busy header | #29 |
| 8, 14 | Two mock entry points, mock timing | #28 |
| 9, 10 | Review queue columns, duplicate topic text | #31 |
| 11 | Problem view under the full header | #30 (focus strip hidden on every width) |
| 12 | Badges without a hover affordance | #30 |
| 15 | One long Settings scroll | #33 |
| 16 | No onboarding | #32 |
| QA | Topic side panel: backup reminder below the list, sideways scrollbar from the badge row | #34 |

Re-measured on the seeded profile (main screen with no panel open, then every
overlay and full-screen view opened in turn):

| Viewport | Map SVG share (was) | Above the map | Page scroll | Challenge / Mock / Progress body overflow | Two plan buttons on one row |
|---|---|---|---|---|---|
| 1536 × 730 | 71 % (43 %, 23 % first run) | 159 px | 0 in every state | 0 / 0 / 0 | yes |
| 1366 × 768 | 72 % (46 %) | 159 px | 0 | 0 / 0 / 0 | yes |
| 1920 × 1080 | 80 % (61 %) | 159 px | 0 | 0 / 0 / 0 | yes |
| 390 × 844 | 70 % portrait route (37 %) | 283 px | 0 | 0 / 0 / 349 px (scrolls in its box) | yes |

No console errors while opening the challenge, mock, reviews, Settings, Progress
and a topic panel and focusing a badge. The welcome showed once on a fresh origin
and not after a reload.
