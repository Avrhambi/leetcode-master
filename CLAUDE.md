# LeetCode Master

Local-first NeetCode 250 practice tracker (NeetCode 75 / 150 flagged inside it). React 19 + TypeScript + Vite, Dexie/IndexedDB,
plain CSS. No server, no auth, no network calls — all data lives in the browser.

## Commands

- `npm install`
- `npm run dev` — Vite dev server (first free port from 8080)
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc -b`
- `npm test -- --run` — unit tests once (Vitest); `npm test` for watch mode
- `npm run build` — production build
- `npm run verify` — lint → typecheck → tests once → build. **Run before every commit.**

Runtime: Node.js 22.12+, npm, one committed `package-lock.json`.

The test environment is pure Node: **no `indexedDB`, no `document`**. Pure logic lives in
`src/services/*.ts` and is unit-tested; components and Dexie migrations are verified by
running the app, not in-process.

## Dependencies

Do not add a dependency without asking first, and explain why existing code can't solve it.

- **Runtime:** `react`, `react-dom`, `dexie`, `dexie-react-hooks`.
- **Dev:** `vite`, `@vitejs/plugin-react`, `typescript`, `eslint`, `@eslint/js`,
  `typescript-eslint`, `vitest`, `@types/react`, `@types/react-dom`.

## Key files

- `src/services/` — pure, **deterministic, unit-tested** rules. No I/O. `reviews.ts`
  (quality + review stage; `lightReviewEligible` and the `lightReview` attempt flag (a recalled review replays as a plain strong attempt, so XP stays reconstructible); late-recall credit, one-stage partial demotion and confident-first-solve rules depend only on the attempt sequence, so they can be replayed), `dailyPlan.ts` (adaptive plan selection; with 12+ reviews due the plan is all reviews and new problems pause — the only thing that bounds the backlog), `mastery.ts` (incl. `proficientTopics`: the one definition behind the map star and the topic badges),
  `streak.ts` (grace days; grace-free daily and weekly streaks for XP; `activeDaysThisWeek` and `parseWeeklyGoal` — the weekly practice-days goal is a display-only setting, `weeklyGoalDays`, and never touches the streak, plan or XP),
  `forecast.ts` (finish forecast: remaining problems ÷ the user's new problems per practised week over the last 28 days; null under 5 new problems, so no number is shown on thin history), `gamification.ts` (XP/levels; `attemptXpAwards` is the one fold that `replayXp` and the live award both read, `stagesBeforeEach` replays prior review stage), `badges.ts` (predicates + set-aware `badgeHint`),
  `attemptForm.ts` (outcome→field rules), `constants.ts` (every threshold and curve),
  `topicPath.ts` (topic-map route geometry — pure, so placement is deterministic),
  `problemSet.ts` (75/150/250 scope: the one filter, `problemsInSet`; the review queue is fed the unfiltered catalog),
  `cadence.ts` (practice profile — new/returning/regular/occasional — derived from attempt dates, never stored; only days before today count so the day's plan shape is stable),
  `skill.ts` (per-topic skill replayed from `attempts`, never stored; sets the plan's difficulty target),
  `topicGraph.ts` (prerequisite edges: a soft priority penalty, never a lock),
  `reinforcement.ts` (the one daily warm-up for a struggling problem; `DailyPlanItem.reason` is in-memory only and recomputed on replay — never add it to `RecommendationEvent.kind`),
  `backupHealth.ts` (backup reminder rule, "last backup" wording, restore summary — pure),
  `attemptTimer.ts` (the built-in attempt timer's pure math: stale-start parsing and rounded 1-600 elapsed minutes; the start time lives in per-device `localStorage` behind `hooks/useAttemptTimer.ts`, never in Dexie or a backup),
  `sessionTime.ts` (per-item minute estimates, calibrated from durations logged *before today*, and `fitPlanToBudget`: new problem first, then top review, then spare due reviews fill leftover minutes, never past four items),
  `calendar.ts` (the practice-reminder `.ics`: weekly `RRULE`, floating local `DTSTART`, CRLF, 75-octet folding, deterministic UID; start date and app URL are arguments — the Settings component passes `localDate()` and `deployedAppUrl(window.location.href)`; nothing stored),
  `reviewNotes.ts` (latest non-empty note per problem, shown before a review),
  `planReason.ts` (the one-line "why this problem today" under each plan item: only facts that hold for the stored item, never a re-run of selection; skill and "started" read attempts from before today so logging an item does not rewrite its line),
  `importKnown.ts` ("mark problems you already know": a progress row only, stage 2, first review dealt evenly over 7-21 days; no Attempt rows, so no XP/streak/badges; undo = progress rows with no attempts),
  `statusLabels.ts` (display-only names for the stored `ProgressStatus` enum — the
  enum itself is persisted and must not be renamed),
  `quickLog.ts` (the plan's three one-tap outcome buttons → a full `AttemptInput` via `attemptForm.ts`, never a light review),
  `attemptUndo.ts` (pure plan for the quick log's 10-second Undo; `db/undoAttempt.ts` is **the only code that deletes an attempt**: it restores the progress row and recommendation stamps from the snapshot `saveAttempt` returns, recomputes XP with `replayXp`, and never un-earns badges),
  `dayWrapUp.ts` (the "Done for today" block: items, minutes (null when none timed), XP earned today read from `attemptXpAwards`, next review date, reviews still due; derived on every render from attempts and progress, never stored, so an Undo just recomputes it).
- `src/db/` — **direct Dexie calls only**, no repository/adapter/factory/queue/cache/retry.
  `database.ts` holds the versioned schema + migrations; `saveAttempt.ts` writes attempt +
  progress + recommendation completion + XP + badges in **one transaction**; `backup.ts`
  is JSON export/restore with `formatVersion` validation (current 3; 1 and 2 still restore; restore is parse → confirm → replace, and keeps rows for ids outside the catalog); `seedCatalog.ts` seeds the
  bundled catalog on first launch. `importKnown.ts` writes the imported marks (and undoes them) in one transaction each. `sessionBudget.ts` saves the time budget and stamps
  `planResetAt` (the same-day replay ignores today's unlogged recommendations made before
  it). Never re-plan by deleting today's recommendation rows, because a render still holding the old
  plan re-persists it.
- `src/data/` — `catalog.ts` + `neetcode250.json`: the 250-problem catalog, each row flagged
  `lists` ⊆ `nc75`/`nc150`/`nc250` (metadata +
  links only, **never problem text**). `topicTiers.ts` maps each topic to a curriculum
  tier. The `[INEFFECTIVE_DYNAMIC_IMPORT]` build warning for `catalog.ts` is known and benign.
- `public/` + `src/pwa.ts` — manifest, icons and hand-written `sw.js` (all paths relative to the registration scope); the worker is registered only in production builds. `requestPersistentStorage` runs once at startup; Settings shows the result.
- `src/hooks/` — `useDailyPlan.ts`, `useGamification.ts` (thin `useLiveQuery` wrappers); `useAttemptTimer.ts` (the one place the attempt timer reads the clock and `localStorage`).
- `src/components/` — one file per screen/panel. Plain React, no state library beyond
  Dexie's `useLiveQuery`. `Overlay.tsx` is the single modal shell (Settings and the
  daily challenge both use it) — don't write a second one.
- `src/styles/` — `../../tokens.css` (oklch dark "phosphor green" design tokens),
  `global.css`, `gamification.css` (`@import`ed from `global.css`). Plain CSS.

## Architecture invariants

- **Dexie migrations are append-only versions.** A `db.version(n).upgrade(cb)` callback
  never re-runs for a user already at `n`, and a fresh install is created at the highest
  version and skips all callbacks. New backfill logic is always a new version, never a
  re-edit of an existing one. Explain migration impact before changing the data model.
- **One attempt save = one transaction** (`saveAttempt.ts`): attempt row, progress
  update, matching daily-recommendation completion, XP award, badge check — all atomic.
- **Level and badge state are derived, not stored where they can drift.** Level is
  `floor(sqrt(xp / 50))`, computed on read. Badges are a monotonic union — never
  un-earned. XP is the only persisted gamification number, and it is reconstructible from
  the `attempts` history alone (`replayXp`), which the Dexie v3/v4/v5 migrations and backup
  restore all rely on. Every XP rule (retention and comeback bonuses, daily/weekly streak
  multiplier) must be a function of the attempt rows, additive or a `max()`, so a re-replay
  can only raise XP; the live award reads its entry from `attemptXpAwards`, never from a
  stored progress row.
- **All recommendation and review rules are deterministic and unit-tested.** No
  wall-clock reads inside the pure functions — dates are passed in as `YYYY-MM-DD` local
  strings.
- **The page never scrolls.** The shell is a fixed `100dvh` grid with `overflow:
  hidden` on `html`/`body`; anything that can grow scrolls inside its own box (the
  side panel, the full-screen problem view, a modal body). The topic map instead
  *scales*: it is an SVG on a fixed viewBox, so it fits any box by construction. The
  one exception is phones (≤ 720 px): the wide route shrinks to unreadable there, so
  `TopicMap` switches to `PORTRAIT_SHAPE` (6 legs of 3), drawn at full width and
  scrolling vertically inside its own canvas. Also on phones, `main` keeps an explicit
  `minmax(0, 1fr)` column (an auto column grew to the badge strip's width), an open
  side panel replaces the map, and an open problem hides the stats and search. Verify layout changes in a browser — `npm run verify`
  cannot see overflow, and "the page doesn't scroll" can pass while content is
  crushed, overlapping, or (for the map) scaled into illegibility.
- **All animation sits behind `prefers-reduced-motion`.** The global rule in `global.css`
  clamps durations; showy gamification animations additionally get `animation: none`.

- **The problem set is filtered once, in `App.tsx`.** `problems` (in-set) feeds the plan, map, mastery,
  search and counts; `allProblems` feeds only the review queue so out-of-set history keeps coming due.
  Switching sets never touches stored progress.

## Conventions

- IDs: `crypto.randomUUID()`. Dates: `YYYY-MM-DD` local-time string keys.
- IndexedDB only (the one per-device exception: the attempt timer's start time in `localStorage`, always in try/catch) — no server, auth, external API, telemetry, AI model, scraping, or
  browser extension.
- External problem links: new tab, `rel="noreferrer"`.
- Caught failures render inline with a single explicit Retry button.
- Search debounce: 200 ms. Every other form action: no debounce.
- Responsive breakpoint: 720 px.

## Automation

`.github/workflows/deploy.yml` runs `npm ci` + `npm run verify` on every push to `master`, then publishes `dist/` to GitHub Pages (needs Settings → Pages → Source: GitHub Actions).

`.github/workflows/ci.yml` runs `npm ci` then `npm run verify` on Node 22.12. It is currently disabled
(manual `workflow_dispatch` only); restore the `pull_request` and `push` triggers to re-enable it.

`.claude/settings.json` runs `.claude/hooks/lint-edited.py` after every Edit/Write: eslint
on **just the edited file**, then `tsc -b` across the project (TypeScript can't check one
file in isolation). Non-`.ts`/`.tsx` edits skip both and exit immediately. If the payload
carries no file path it falls back to linting the whole project, so the hook never
silently checks nothing.

It does not build or run tests — do that yourself via `npm run verify` before committing.

## Delivery

Planned work lives in `ROADMAP.md`: one task per session/PR, with a status board, an
ownership map and a session log that each PR updates.

One workstream per change; each passes `npm run verify`. Commit messages:
`<module>: <what and why>`, one logical change per commit.
