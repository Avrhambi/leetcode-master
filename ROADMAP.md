# Roadmap

The work plan for taking the app from "working local tracker" to "installable,
open-source practice coach on the NeetCode 250". Every task is sized for **one
Claude Code session = one PR**, has a single owner area, and lists what it must
*not* touch, so no two sessions do the same work.

## How a session uses this file

Kick off a session with:

> Implement task **T\<n\>** from `ROADMAP.md`. Follow its session protocol.

Session protocol (every task):

1. Read `CLAUDE.md`, then this file. Confirm every task in your **Depends on**
   row is `Done` on `master`. If one isn't, stop and say so. Don't build it yourself.
2. Branch off the latest `master` (or use the branch the session was given).
3. Do **only** what your task's **Scope** lists. If you find something else that
   needs doing, add one line to the [Parking lot](#parking-lot) and leave it.
   Anything listed under **Not in scope** belongs to another task.
4. `npm run verify` must pass. Any UI change is also checked in a browser
   (`npm run dev`), including the 720 px breakpoint and "the page never scrolls".
5. In the **same PR**: set your row in the status board to `Done`, fill in your
   entry in the [Session log](#session-log), and update `CLAUDE.md` wherever your
   change adds a key file, invariant, or convention.
6. Commit messages: `<module>: <what and why>`. Open the PR against `master`.

If a task turns out too big for one PR, finish a coherent first half, mark the
row `Partial`, and write in the log exactly what remains. The next session picks
up from there.

## Status board

| ID | Task | Depends on | Can run in parallel with | Status |
|----|------|-----------|--------------------------|--------|
| T0 | CI + dependency hygiene | — | T1, T6 | Todo |
| T1 | Catalog → NeetCode 250 with neetcode.io links | — | T0, T6 | Todo |
| T2 | Problem-set selector (150 / 250) | T1 | T3 | Todo |
| T3 | Competency engine: topic skill + prerequisite graph | T1 | T2 | Todo |
| T4 | Competency engine: reinforcement problems on repeated failure | T3 | T6, T7 | Todo |
| T5 | Gamification aligned to the app's goals | T1, T2, T3 | T6, T7 | Todo |
| T6 | PWA: installable, offline, persistent storage | — | anything | Todo |
| T7 | Backup hardening | T2 | T4, T5, T6 | Todo |
| T8 | Live demo on GitHub Pages | T0, T6 | T4, T5, T7 | Todo |
| T9 | Open-source packaging: name, README, CONTRIBUTING, license | T1–T8 | — | Todo |

Suggested order: **T0 → T1 → (T2 ∥ T3) → T4 → T5**, with **T6**, **T7** and **T8**
slotted in whenever a session is free. **T9** goes last.

## Decisions already made (don't relitigate)

- **Problem ingestion = Option A (bundled, curated catalog).** That's what the app
  already does (`src/data/`). Option B (LeetCode GraphQL) and Option C (browser
  extension) are **rejected**. Both break the `CLAUDE.md` invariant of no external
  API, scraping or extension, and both depend on a third party that can break them
  at any time. No task builds them.
- **Links go to neetcode.io.** Some NeetCode 150 problems (Meeting Rooms, Graph
  Valid Tree, Alien Dictionary, Walls and Gates, …) are LeetCode Premium. NeetCode
  hosts all of them for free. The LeetCode link stays as a secondary link.
- **Problem IDs don't change.** `CatalogProblem.id` stays the LeetCode slug, so
  every existing `progress` and `attempts` row keeps working with no data migration.
- **No Elo/IRT stored ratings.** "Skill" is a *derived*, deterministic number
  replayed from the `attempts` history, the same way XP is (see T3). A single
  user's 250 problems can't calibrate per-problem IRT parameters, and a stored
  rating can drift.
- **Data portability already exists** (JSON export/restore with `formatVersion`,
  `src/db/backup.ts`). T7 only closes the gaps. It doesn't rebuild that feature.
- **Not for commercial use.** T9 picks the license with the owner. A
  non-commercial license isn't OSI "open source", so the README calls it
  *source-available*.

## Ownership map (who may edit what)

To keep two sessions from editing the same logic:

| Area | Owner task(s) |
|------|---------------|
| `src/data/neetcode*.json`, `catalog.ts`, `CatalogProblem` type | T1 |
| Problem-set setting + filtering of the problem list fed to the app | T2 |
| `src/services/dailyPlan.ts` selection rules, new `skill.ts`, `topicGraph.ts` | T3, then T4 |
| XP formula, badges, map "cleared" star, `gamification*.ts`, Dexie v5 | T5 |
| `public/`, manifest, service worker, `navigator.storage.persist()` | T6 |
| `src/db/backup.ts` (beyond adding a settings key, see below) | T7 |
| `.github/workflows/ci.yml`, `package.json` versions | T0 |
| `.github/workflows/deploy.yml` | T8 |
| `README.md`, `CONTRIBUTING.md`, `LICENSE`, product name | T9 |

**Shared rule:** any task that adds a persisted `AppSettingKey` must also add it to
`settingKeys` in `src/db/backup.ts` and to the `AppSettingKey` type. That's a
one-line touch and doesn't make the task a backup-hardening task.

---

## T0. CI + dependency hygiene

**Why:** every later PR should be checked by a machine, not by memory. Today there's
no `.github/` at all. `package.json` pins every dependency to `"latest"`, so a fresh
clone without the lockfile can build with whatever happens to be newest that day.

**Scope**
- `.github/workflows/ci.yml`: on `pull_request` and on `push` to `master`, set up
  Node 22.12+, run `npm ci`, then `npm run verify`.
- Replace every `"latest"` in `package.json` with a caret range at the version
  `package-lock.json` already resolves (no upgrades). Move `@vitejs/plugin-react`
  to `devDependencies`.
- Remove the unused `jsdom` dev dependency. Nothing imports it, and `CLAUDE.md`
  says tests run in pure Node.
- Add `"engines": { "node": ">=22.12" }`.

**Not in scope:** deploy (T8), README badges (T9), dependency upgrades.

**Deliverable:** green CI run on the PR itself. `npm ci && npm run verify` is clean
locally.

---

## T1. Catalog → NeetCode 250 with neetcode.io links

**Why:** LeetCode Premium blocks some current links. The owner also wants the full
NeetCode 250.

**Scope**
- Replace `src/data/neetcode150.json` with `src/data/neetcode250.json` (250 rows,
  NeetCode 250 order). Row shape:
  `{ title, slug, neetcodeSlug, difficulty, topics, primaryTopic, inNeetcode150 }`.
  `slug` is the **LeetCode** slug (the stable id). `neetcodeSlug` is NeetCode's own
  slug, which often differs (e.g. `contains-duplicate` → `duplicate-integer`), so
  it **can't be derived** and must come from the source list.
- Source the list from neetcode.io/practice (reachable from the cloud
  environment). If it can't be fetched reliably, stop and ask the owner for an
  export instead of guessing slugs.
- `CatalogProblem` gains `neetcodeUrl` (`https://neetcode.io/problems/<neetcodeSlug>`)
  and `inNeetcode150`. `leetcodeUrl` stays. `neetcodeOrder` becomes the 250-list
  order.
- Bump `CATALOG_VERSION` (e.g. `neetcode-250-v1`). `seedCatalog` re-puts the
  problems. The `problems` store indexes don't change, so **no Dexie version bump**.
  Write that reasoning into the PR description.
- Links: `ProblemDetail` and `DailyPlan` get a primary "Solve on NeetCode" link and
  a secondary "LeetCode" link (new tab, `rel="noreferrer"`). Update the
  `DailyPlan` intro copy too.
- `src/data/topicTiers.ts`: confirm every NeetCode 250 `primaryTopic` is mapped.
  A new topic needs a tier. Keep the 18-topic map if the 250 uses the same 18.
- New unit test `src/data/catalog.test.ts`: 250 rows; unique `id` and
  `neetcodeSlug`; every one of the **current 150 ids is still present** and
  flagged `inNeetcode150` (guards existing users' data); every `primaryTopic` is
  in `TOPIC_TIERS` and in its own `topics`; difficulty enum is valid; URLs are
  well-formed.
- User-visible "150" copy only: badge hints in `constants.ts` ("all 150",
  "75 of the 150") get catalog-neutral wording. Badge **thresholds and semantics
  stay unchanged** (T5 owns them). Also update the README sentence about "the
  150-problem catalog".
- Check the topic map in a browser with the bigger per-topic counts.

**Not in scope:** the 150/250 toggle (T2), plan ordering (T3), badge thresholds (T5).

**Deliverable:** the app seeds 250 problems. Every NeetCode link in the plan and
detail views opens a free problem page. An existing v4 database keeps all its
progress after the reseed (check it in a browser: log attempts on the old build,
switch to the new build, reload).

---

## T2. Problem-set selector (NeetCode 150 / NeetCode 250)

**Why:** the 150 is the list most people commit to. The 250 is the extended
version. Users should be able to choose their scope, and progress counters should
match that choice.

**Scope**
- New setting `problemSet: 'nc150' | 'nc250'` (default `nc250`) in `settings`.
  Follow the shared rule above for `backup.ts`.
- Add a selector to `Settings`. It changes no stored progress. Out-of-set problems
  keep their history and just aren't shown or recommended.
- Filter the problem list **once**, where it's read from Dexie (one small pure
  helper in `src/services/`, unit-tested), so the daily plan, review queue, topic
  map, mastery counts and badge inputs all see the same set. The review queue
  still shows due reviews for out-of-set problems the user already attempted, so
  retention never silently stops. Unit-test this.
- Progress labels like "x / N" use the active set's `N`.

**Not in scope:** how the plan picks within a topic (T3), badge changes (T5).

**Deliverable:** switching to 150 drops the extra 100 from the plan, map and
counts. Switching back restores them. Both directions are verified in a browser.

---

## T3. Competency engine: topic skill + prerequisite graph

**Why:** the plan gates difficulty on mean review stage across *every* problem in a
topic (`topicMastery` → `maxDifficultyFor` in `dailyPlan.ts`). Going from 150 to
250 problems **dilutes** that mean: a user who's good at Trees would be held on
Easy far longer, because there are more untouched Trees problems. Topics are also
picked independently, so the plan can push Advanced Graphs before Graphs makes
sense.

**Scope**
- `src/services/skill.ts` (pure, unit-tested). A per-topic skill in `[0, 1]`,
  replayed deterministically from the `attempts` history: an Elo-style update per
  attempt. The attempt quality is the "result" and the problem's difficulty is the
  "opponent rating". Same-day repeats are discounted, mirroring XP. It isn't
  stored anywhere, so it can't drift.
- `src/services/topicGraph.ts` (pure data + helpers). Prerequisite edges between
  the 18 topics, for example Two Pointers → Sliding Window, Arrays & Hashing →
  Two Pointers, Trees → Tries, Trees → Backtracking, Graphs → Advanced Graphs,
  1-D DP → 2-D DP, Trees → Heap. Add a test that the graph is acyclic and that
  every topic in `TOPIC_TIERS` appears in it.
- `dailyPlan.ts`:
  - Difficulty ceiling comes from topic skill, not diluted mean stage.
  - A topic whose prerequisites are below a skill threshold gets a **priority
    penalty**, not a hard lock. Users can still open anything from the map.
  - Within a topic, pick `inNeetcode150` problems before the extra 100 when
    everything else is equal (core-first).
- All thresholds go in `constants.ts`. Keep the existing struggling rules (the
  priority 0.5 relief and the ceiling using the real stage) or replace them with
  an equivalent that is explicitly tested.
- Extend `dailyPlanSimulation.test.ts`: a simulated learner progresses through
  prerequisites in order, reaches Medium in a topic after a few strong Easy solves
  regardless of topic size, and a failing learner isn't flooded.

**Not in scope:** injecting reinforcement problems (T4), topic-map visuals and
stars (T5), any persisted field.

**Deliverable:** pure modules + tests, with the plan driven by skill and the
graph. No schema change.

---

## T4. Competency engine: reinforcement problems on repeated failure

**Why:** today a struggling problem only backs off its reviews (2/4/7 days).
Nothing helps the user *build up* to it.

**Scope**
- When a problem in the plan's horizon is `struggling` (or has 2+
  `consecutiveWeak`), the plan includes one **reinforcement** item. Pick an
  easier, already-solved problem from the same topic first, then from a
  prerequisite topic (`topicGraph.ts`). Pick an unsolved Easy from the same topic
  if nothing is solved yet. Use at most one per day, and it takes a plan slot (the
  plan stays 2–4 items).
- Expose the reason on the in-memory `DailyPlanItem` (e.g.
  `reason: 'reinforce'`) and show it in the UI ("Warm-up for *X*"). **Don't** add
  a value to the persisted `RecommendationEvent.kind` enum. Store it as `new` or
  `review` and recompute the reason, so backups and older builds stay compatible.
  Same-day replay must stay stable.
- Unit tests plus a simulation case: 3 failures on a Medium yields a same-topic
  Easy warm-up, and the warm-up stops once the problem is no longer struggling.

**Not in scope:** changes to the struggling backoff ladder, gamification for
comebacks (T5).

**Deliverable:** the warm-up item appears in the plan, with tests.

---

## T5. Gamification aligned to the app's goals

**The app's goals:** (1) retain what you learned (spaced review), (2) fix weak
topics instead of avoiding them, (3) log honestly, (4) practise steadily.
Gamification should pay for exactly those things.

**Where it's misaligned today**
- XP ignores whether an attempt was a successful *spaced recall*. A due review
  that proves retention earns the same as a first try on a new problem, even
  though retention is the product's core idea.
- Volume badges ("attempt 75 / 100") reward breadth over retention, and their
  numbers came from the 150-problem catalog.
- `topic-cleared`, `all-mastered` and the map star need *every* problem in a
  topic mastered (passed its 30-day review). With 250 problems that's practically
  unreachable, so the main visual reward never lights up.
- Turning a struggling problem around is the hardest and most valuable event in
  the app, and it earns nothing special.
- Level badges reward XP a second time.

**Scope**
- **XP** (`gamification.ts`, `constants.ts`):
  - A **retention bonus** on a strong or partial attempt whose *prior* review
    stage was ≥ 1, growing with stage. The prior stage is replayable from attempts
    alone, because stage transitions depend only on quality and the same-day flag.
    Add a pure `stagesBeforeEach(attempts)` reusing the `progressAfterAttempt`
    rules.
  - A **comeback bonus** on the strong attempt that ends a run of
    `STRUGGLE_THRESHOLD`+ weak attempts.
  - Weak attempts keep earning XP, so honest logging is never punished. Bonuses
    are only **additive**, so the re-replay can only raise a user's XP.
  - **Dexie v5** re-replays XP exactly like v4. Explain the migration impact in
    the PR. `replayXp` stays the single definition, so backup restore picks up the
    new formula for free.
- **Badges** (additive, so no earned badge disappears):
  - Retention axis: "Retained 10 / 25 / 50" (problems at stage ≥ 3).
  - "Comeback" (first struggling problem turned strong).
  - "Foundations solid" (every tier-1 topic at T3's skill threshold).
  - `topic-cleared` / `five-topics-cleared` / map star: redefine as "topic
    proficient". Every **core** (`inNeetcode150`) problem in the topic at stage
    ≥ 3, within the active problem set. Loosening a predicate only means badges
    can arrive earlier, never be lost.
  - Volume badges: keep the ids. Make the hints reference the active set.
  - Order the shelf retention → consistency → mastery → volume → level.
- Update `BadgeShelf` / `GamificationBar` / `TopicMap` for the new badges and
  star. Respect `prefers-reduced-motion`.
- Tests: replay == live award for the new bonuses; v5 never lowers XP; new badge
  predicates; monotonic merge still holds.

**Not in scope:** plan selection (T3/T4), new persisted gamification numbers. XP
stays the only one.

**Deliverable:** new XP rules + badges + map star, the v5 migration, tests, and a
short "why each reward exists" comment block in `constants.ts`.

---

## T6. PWA: installable, offline, persistent storage

**Why:** the app is already serverless. Installing it and running it offline is
mostly packaging. The more important part: browsers can **evict IndexedDB** for
sites that aren't installed or persisted (Safari after about 7 days without a
visit). For a local-first app, that's silent data loss.

**Scope** (no new dependencies; a hand-written service worker is ~60 lines):
- `public/manifest.webmanifest`: name, short name, `display: standalone`, theme
  and background colours from `tokens.css`, icons 192 / 512 / maskable. Draw an
  SVG mark and export the PNGs once via the pre-installed Playwright Chromium
  (no new dependency), then commit them. Link the manifest and add the
  `theme-color` meta in `index.html`.
- `public/sw.js`: precache `index.html` on install. Use cache-first for
  same-origin hashed assets and network-first with cache fallback for
  navigations. Clean up old caches on activate. Every path is **relative to the
  registration scope** (`vite.config.ts` uses `base: './'`, and T8 serves the app
  under `/leetcode-master/`).
- Register the worker only in production builds (`import.meta.env.PROD`). When a
  new worker is waiting, show a small "Update available — Reload" control.
- On startup, call `navigator.storage.persist()` once, wrapped in try/catch. Show
  the result in Settings ("Storage: persistent / may be cleared by the
  browser"). That status line also says to export backups regularly.
- Browser check: `npm run build && npx vite preview`, install, go offline,
  reload. The app works and data is intact.

**Not in scope:** deploy (T8), backup reminders (T7).

**Deliverable:** a Lighthouse-installable build that works offline, plus a
persistent-storage request.

---

## T7. Backup hardening

**Why:** export and restore exist. What's missing is the habit, and safety on the
destructive path.

**Scope**
- Export filename gets the date: `<app>-backup-YYYY-MM-DD.json`.
- New setting `lastBackupOn` (shared rule above), written on a successful export.
  Settings shows "Last backup: N days ago". A quiet reminder appears in the side
  panel when there's progress and no backup in 14+ days (threshold in
  `constants.ts`, reminder logic pure and unit-tested).
- Restore safety: before `restoreBackup` replaces data, offer "Download current
  data first" (reuse `createBackupPayload`). After a successful restore, show a
  summary ("Restored N attempts across M problems").
- Restore tolerance: attempts or progress for problem ids that aren't in the
  catalog are kept, not rejected, and reported in the summary. Extend
  `backup.test.ts`.
- Add `catalogVersion` and `appVersion` to the export as informational fields,
  bumping `formatVersion` to 3 and still accepting 1 and 2. Test all three.

**Not in scope:** merge-import across devices (replace is enough for moving between
devices; merging is a later idea), cloud sync of any kind.

**Deliverable:** UI + tests. A v2 backup from today's build restores cleanly.

---

## T8. Live demo on GitHub Pages

**Scope**
- `.github/workflows/deploy.yml`: on push to `master`, run `npm ci && npm run
  verify`, then deploy `dist/` with the official Pages actions. The owner enables
  Pages (Source: GitHub Actions) in repo settings. Ask them, because the session
  can't do it.
- Confirm the relative `base` works under `https://<owner>.github.io/leetcode-master/`
  and that T6's service worker and manifest resolve there (install + offline
  check on the live URL).
- Record the live URL in this file's log for T9.

**Not in scope:** custom domain, README (T9).

**Deliverable:** a working public URL.

---

## T9. Open-source packaging

**Scope**
- **Name.** The repo is `leetcode-master`, `package.json` says `leetcode-tracker`,
  the UI says "LeetCode Tracker" and `CLAUDE.md` says "PatternPilot". Ask the owner
  to pick one name. Prefer one without "LeetCode"/"NeetCode" in it to avoid
  trademark confusion. Apply it to the UI title, `<title>`, manifest, package name,
  docs and the export filename. **Never rename the Dexie database name
  `pattern-pilot`**, because that would orphan every user's data.
- **README** for the community: the retention-decay problem, how the loop works,
  a Mermaid architecture diagram of the local-first storage (UI → hooks →
  pure services → Dexie → IndexedDB, plus backup and the service worker), a
  screenshot or GIF, the live demo link (T8), install-as-app instructions, the
  privacy statement (no server, no telemetry), and a disclaimer that it's not
  affiliated with LeetCode or NeetCode and stores only titles and links, never
  problem text.
- **CONTRIBUTING.md**: setup, `npm run verify`, the commit and PR convention, how
  to propose a catalog change (edit the JSON, and `catalog.test.ts` must pass),
  how to propose a topic-graph edge or a threshold change (with a simulation test).
- **LICENSE**: ask the owner. For "not for commercial use", the candidates are
  PolyForm Noncommercial 1.0.0 or CC BY-NC 4.0; for open source, MIT. State in
  the README that a non-commercial license is "source-available".
- Minimal `.github/ISSUE_TEMPLATE/` (bug, catalog fix) and
  `pull_request_template.md`.
- A CI badge (T0) in the README.

**Deliverable:** a repo a stranger can understand, try and contribute to in five
minutes.

---

## Parking lot

Ideas noticed during sessions that aren't in any task. Add one line each, with
your task ID. Don't implement them.

- *(empty)*

## Session log

Each session fills in its own entry in its PR.

### T0
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T1
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T2
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T3
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T4
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T5
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T6
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T7
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T8
- Status / PR / date:
- Live URL:
- Decisions & deviations:
- Follow-ups:

### T9
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:
