# PatternPilot

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
  (quality + review stage; late-recall credit, one-stage partial demotion and confident-first-solve rules depend only on the attempt sequence, so they can be replayed), `dailyPlan.ts` (adaptive plan selection), `mastery.ts`,
  `streak.ts` (grace days), `gamification.ts` (XP/levels), `badges.ts`,
  `attemptForm.ts` (outcome→field rules), `constants.ts` (every threshold and curve),
  `topicPath.ts` (topic-map route geometry — pure, so placement is deterministic),
  `problemSet.ts` (75/150/250 scope: the one filter, `problemsInSet`; the review queue is fed the unfiltered catalog),
  `cadence.ts` (practice profile — new/returning/regular/occasional — derived from attempt dates, never stored; only days before today count so the day's plan shape is stable),
  `skill.ts` (per-topic skill replayed from `attempts`, never stored; sets the plan's difficulty target),
  `topicGraph.ts` (prerequisite edges: a soft priority penalty, never a lock),
  `statusLabels.ts` (display-only names for the stored `ProgressStatus` enum — the
  enum itself is persisted and must not be renamed).
- `src/db/` — **direct Dexie calls only**, no repository/adapter/factory/queue/cache/retry.
  `database.ts` holds the versioned schema + migrations; `saveAttempt.ts` writes attempt +
  progress + recommendation completion + XP + badges in **one transaction**; `backup.ts`
  is JSON export/restore with `formatVersion` validation; `seedCatalog.ts` seeds the
  bundled catalog on first launch.
- `src/data/` — `catalog.ts` + `neetcode250.json`: the 250-problem catalog, each row flagged
  `lists` ⊆ `nc75`/`nc150`/`nc250` (metadata +
  links only, **never problem text**). `topicTiers.ts` maps each topic to a curriculum
  tier. The `[INEFFECTIVE_DYNAMIC_IMPORT]` build warning for `catalog.ts` is known and benign.
- `src/hooks/` — `useDailyPlan.ts`, `useGamification.ts` (thin `useLiveQuery` wrappers).
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
  the `attempts` history alone (`replayXp`), which the Dexie v3/v4 migrations and backup
  restore all rely on.
- **All recommendation and review rules are deterministic and unit-tested.** No
  wall-clock reads inside the pure functions — dates are passed in as `YYYY-MM-DD` local
  strings.
- **The page never scrolls.** The shell is a fixed `100dvh` grid with `overflow:
  hidden` on `html`/`body`; anything that can grow scrolls inside its own box (the
  side panel, the full-screen problem view, a modal body). The topic map instead
  *scales*: it is an SVG on a fixed viewBox, so it fits any box by construction and
  needs no per-width tuning. Verify layout changes in a browser — `npm run verify`
  cannot see overflow, and "the page doesn't scroll" can pass while content is
  crushed, overlapping, or (for the map) scaled into illegibility.
- **All animation sits behind `prefers-reduced-motion`.** The global rule in `global.css`
  clamps durations; showy gamification animations additionally get `animation: none`.

- **The problem set is filtered once, in `App.tsx`.** `problems` (in-set) feeds the plan, map, mastery,
  search and counts; `allProblems` feeds only the review queue so out-of-set history keeps coming due.
  Switching sets never touches stored progress.

## Conventions

- IDs: `crypto.randomUUID()`. Dates: `YYYY-MM-DD` local-time string keys.
- IndexedDB only — no server, auth, external API, telemetry, AI model, scraping, or
  browser extension.
- External problem links: new tab, `rel="noreferrer"`.
- Caught failures render inline with a single explicit Retry button.
- Search debounce: 200 ms. Every other form action: no debounce.
- Responsive breakpoint: 720 px.

## Automation

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

Atomic PRs off `master`, one workstream each, never commit direct to `master`. Each PR
passes `npm run verify`. Commit messages: `<module>: <what and why>`, one logical change
per commit.
