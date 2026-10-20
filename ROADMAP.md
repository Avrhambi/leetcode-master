# Roadmap

The work plan for taking **LeetCode Master** from "working local tracker" to
"installable, open-source practice coach on the NeetCode 75 / 150 / 250". Every
task is sized for **one Claude Code session = one PR**, has a single owner area,
and lists what it must *not* touch, so no two sessions do the same work.

## How a session uses this file

Kick off a session with:

> Implement task **T\<n\>** from `ROADMAP.md`. Follow its session protocol.

Session protocol (every task):

1. Read `CLAUDE.md`, then this file. Confirm every task in your **Depends on**
   row is `Done` on `master`. If one isn't, stop and say so. Don't build it yourself.
2. Branch off the latest `master` (or use the branch the session was given).
3. Do **only** what your task's **Scope** lists. If you find something else that
   needs doing, add one line to the [Parking lot](#parking-lot) and leave it.
   Anything under **Not in scope** belongs to another task.
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
| T0 | CI + dependency hygiene | — | T1, T7 | Done |
| T1 | Catalog → NeetCode 250 with NeetCode 75 / 150 flags and neetcode.io links | — | T0, T7 | Done |
| T2 | Problem-set selector (75 / 150 / 250) | T1 | T3 | Done |
| T3 | Competency engine: topic skill + prerequisite graph | T1 | T2 | Done |
| T4 | Cadence-aware plan: regular, occasional and returning users | T3 | T7, T8 | Done |
| T11 | Review load: reach mastery with fewer repeats | T4 | T7, T8 | Done |
| T5 | Competency engine: reinforcement problems on repeated failure | T11 | T7, T8 | Done |
| T6 | Gamification aligned to the app's goals and to every practice cadence | T2, T4, T11 | T7, T8 | Done |
| T7 | PWA: installable, offline, persistent storage | — | anything | Done |
| T8 | Backup hardening | T2 | T4, T5, T6, T7 | Done |
| T9 | Live demo on GitHub Pages | T0, T7 | T4, T5, T6, T8 | Done |
| T10 | Open-source packaging: README, CONTRIBUTING, license, name | T1–T9 | — | Done |
| T12 | Session time: plan estimate, time budget, "your note" before a review | T11 | T14, T15 | Done |
| T13 | Light review: "recalled the approach" instead of a full re-solve | T12 | — | Done |
| T14 | Finish forecast + weekly practice-days goal | T12 | T15 | Done |
| T15 | End-of-session wrap-up screen | T12 | T14 | Planned |
| T16 | Goal plans: interview deadline, "skip Easies" for experienced users | T12, T14 | — | Planned |
| T17 | Built-in attempt timer (fills the duration automatically) | T12 | T19, T20, T21 | Planned |
| T18 | Quick log from the plan: three outcome buttons on each item | T17 | T20, T21 | Planned |
| T19 | "Why this problem today?" line on each plan item | T12 | T17, T20, T21 | Planned |
| T20 | Import prior history: mark problems you already know | T2 | T17, T19, T21 | Done |
| T21 | Calendar reminder: download a recurring .ics event | — | anything | Planned |

Suggested order: **T0 → T1 → (T2 ∥ T3) → T4 → T11 → T5 → T6**, with **T7**, **T8**
and **T9** slotted in whenever a session is free. **T10** goes last. T3, T4, T11
and T5 all change how the plan behaves, so they run one after another, never in
parallel. (T11 was added after the first numbering, which is why it sits between
T4 and T5 in the order.)

**Second wave (T12–T16), from the usage review of 2026-10-19.** The simulation's
typical user spends ~65–75 min a session and ~88% of plan items are reviews.
That review ranked fixes by impact for the effort: time control first (T12), then
the biggest time saving (T13), then motivation and goals (T14–T16). T13 changes
what counts as a successful review, so it ships only after a simulation shows
retention holds. T13 and T16 change plan selection, so they run one after
another, never in parallel.

**Third wave (T17–T21), from the 2026-10-19 average-user review.** These cut the
daily friction around the plan rather than change what the plan picks.
Suggested order: **T13 → T17 → T18 → T19**, then **T20** and **T21** whenever a
session is free.
- **T17 first:** without it `durationMinutes` is almost always empty, so T12's
  estimates never calibrate to the user.
- **`DailyPlan.tsx`:** T15, T18 and T19 all edit it, so they run one after
  another, never in parallel.

## Decisions already made (don't relitigate)

- **The app is called LeetCode Master** (repo `leetcode-master`). T10 applies the
  name everywhere. The README carries a "not affiliated with LeetCode or NeetCode"
  disclaimer.
- **Problem ingestion = Option A (bundled, curated catalog).** That's what the app
  already does (`src/data/`). Option B (LeetCode GraphQL) and Option C (browser
  extension) are **rejected**. Both break the `CLAUDE.md` invariant of no external
  API, scraping or extension, and both depend on a third party that can break them
  at any time. No task builds them.
- **Three problem sets, one catalog.** NeetCode 75 (the Blind 75 list as
  neetcode.io presents it) ⊂ NeetCode 150 ⊂ NeetCode 250. There's one 250-row
  catalog, and each row is flagged with the lists it belongs to. T1 confirms the
  subset relation against neetcode.io and reports any exception instead of
  guessing.
- **Links go to neetcode.io.** Some NeetCode 150 problems (Meeting Rooms, Graph
  Valid Tree, Alien Dictionary, Walls and Gates, …) are LeetCode Premium. NeetCode
  hosts all of them for free. The LeetCode link stays as a secondary link.
- **Problem IDs don't change.** `CatalogProblem.id` stays the LeetCode slug, so
  every existing `progress` and `attempts` row keeps working with no data migration.
- **No Elo/IRT stored ratings.** "Skill" and "cadence" are *derived*,
  deterministic values replayed from the `attempts` history, the same way XP is.
  A single user's ~250 problems can't calibrate per-problem IRT parameters, and a
  stored rating can drift.
- **Data portability already exists** (JSON export/restore with `formatVersion`,
  `src/db/backup.ts`). T8 only closes the gaps. It doesn't rebuild that feature.
- **Not for commercial use.** T10 picks the license with the owner. A
  non-commercial license isn't OSI "open source", so the README calls it
  *source-available*.

## How the plan serves every kind of user

This is the design goal behind T3–T6. Each task below has to keep these promises,
and T4 adds the simulation tests that check them.

| User | What they need | Handled by |
|------|----------------|------------|
| **Regular** (4+ active days every week) | Steady new material plus on-time reviews. A way to keep going when today's plan is done early. Rewards for consistency. | Today: review-first plan of 2–4 items. T4: "One more problem" once the plan is done. T6: daily and weekly streaks. |
| **Occasional** (1–3 days a week, uneven) | Each short session spent on what matters most: the reviews most at risk of being forgotten, and core problems first. Not punished for a schedule that's actually fine. | T4: at-risk review ordering, narrower topic focus, core-list-first new problems. T6: weekly consistency counts as much as a daily streak. |
| **Returning after a gap** (7+ days away) | A gentle re-entry, not a wall of overdue reviews or a reset. | T4: re-entry plan. The review queue still holds the full backlog without inflating the daily plan. T6: no badge or XP is ever lost. |
| **Brand new** | Easy wins in foundation topics, no reviews yet. | Today: tier weighting. T3: prerequisite graph. |
| **Stuck on a topic** | Not flooded with the same topic, but helped back up to it. | Today: struggling backoff. T5: warm-up problems. |

**What exists today, honestly:** the plan size (2–4) depends only on how many
reviews are due. The review queue lets anyone drain a backlog. The streak has one
grace day a week. Nothing in the app knows *how often* a user practises, so an
occasional user gets the same plan as a daily one. Overdue reviews are ordered
weakest-first, so a review 30 days overdue ranks the same as one a day overdue.
The XP streak multiplier only counts *consecutive* days, so someone practising
steadily three days a week never gets it. T4 and T6 close these gaps.

### Two more gaps found in today's code

- **Stuck on Easy.** The difficulty gate uses the mean review stage over *every*
  problem in a topic. Medium needs a mean of 0.2 and Hard needs 0.5. In Arrays &
  Hashing (9 problems) Medium needs 9 stage-points: three Easies each reviewed
  twice, which takes 10+ days. Within the allowed range the plan also always
  picks the *easiest* problem first. So in Trees (6 Easies) and Bit Manipulation
  (5) a user does every Easy before seeing a Medium, and Hard mostly appears only
  after a topic's Mediums run out. With the 250's extra Easies this gets worse.
  T3 fixes it.
- **Too much repetition of the same problems.** Mastery needs 5 strong attempts
  of the same problem on separate days. Any partial attempt drops a problem back
  to stage 1, even from stage 4. A strong recall that comes very late (common for
  occasional users) earns no more than an on-time one. A 2-days-a-week user has
  room for about 6 reviews a week but creates more than that, so the backlog
  grows. Late reviews then get forgotten and reset, which means even more
  repeats. T11 fixes it.

### Plan quality targets (enforced by simulation tests)

These turn "every user is represented", "they reach mastery without needless
repetition" and "not stuck on Easy" into numbers. A session that can't meet a
target records why in its log entry. It never loosens a target silently.

| Target | Owner |
|--------|-------|
| A succeeding learner is offered their first Medium in a topic after at most **2 strong Easy** solves in that topic, whatever set is active (75, 150 or 250) and however many Easies the topic has. | T3 |
| A succeeding learner is offered a Hard in a topic after at most **3 strong Medium** solves in that topic. | T3 |
| Once Medium is unlocked, a succeeding learner's new problems in that topic are Medium or harder. Easies only come back as warm-ups (T5). | T3 |
| A struggling learner's ceiling drops back again, and they're never pushed into a Hard while failing Mediums. | T3 |
| Every persona gets ≥ 1 new problem per active day unless 12+ reviews are due (then the plan is all reviews), and the plan never exceeds 4 items. | T4 |
| A typical learner's due backlog stays ≤ 30 over 52 simulated weeks at every cadence. | T4 (review overload) |
| A strong-every-time learner masters a problem in **≤ 5 attempts** at every cadence. A learner who's late on reviews but still recalls strongly needs *fewer* attempts than on time, never more. The simulation records the mean attempts-to-mastery per persona before and after T11. | T11 |
| The same problem is never in the plan on two active days in a row unless its last attempt was weak. A weak problem returns at most 3 sessions in a row before backing off. | T11 |
| The 2-days-a-week persona's due backlog stays bounded over 12 simulated weeks. The session records the measured bound in the test. | T11 |

Simulation personas (shared by T3, T4 and T11 in `dailyPlanSimulation.test.ts`):
- **fast**: always strong.
- **typical**: mostly strong, some partial, fails some Hards.
- **struggling**: weak on one topic, fine elsewhere.

Each persona runs at three cadences: daily, 4 days a week and 2 days a week
irregular. One more scenario is 3 weeks regular, then a 14-day gap, then resume.

## Ownership map (who may edit what)

To keep two sessions from editing the same logic:

| Area | Owner task(s) |
|------|---------------|
| `src/data/neetcode*.json`, `catalog.ts`, `CatalogProblem` type | T1 |
| Problem-set setting + filtering of the problem list fed to the app | T2 |
| `src/services/dailyPlan.ts` selection rules, new `skill.ts`, `topicGraph.ts` | T3 → T4 → T5, in that order |
| New `src/services/cadence.ts` | T4 (T6 reads it and doesn't change it) |
| `src/services/reviews.ts` stage and interval rules | T11 (T13 adds `lightReviewEligible` and the `lightReview` attempt flag) |
| XP formula, streak multiplier, badges, map "cleared" star, `gamification*.ts`, Dexie v5 | T6 |
| `public/`, manifest, service worker, `navigator.storage.persist()` | T7 |
| `src/db/backup.ts` (beyond adding a settings key, see below) | T8 |
| `.github/workflows/ci.yml`, `package.json` versions | T0 |
| `.github/workflows/deploy.yml` | T9 |
| `README.md`, `CONTRIBUTING.md`, `LICENSE`, app name in UI/package/manifest | T10 |
| `src/services/sessionTime.ts`, `db/sessionBudget.ts`, budget + estimate UI in `DailyPlan.tsx` | T12 (T13, T15 read it) |
| Attempt timer (new `services/attemptTimer.ts` + the timer control in `ProblemDetail` / `AttemptForm`) | T17 (T18 reads it) |
| Inline outcome buttons on plan items (`DailyPlan.tsx`), new `services/quickLog.ts` | T18 |
| New `services/planReason.ts` + the reason line in `DailyPlan.tsx` | T19 |
| Import screen + new `services/importKnown.ts`, `db/importKnown.ts` | T20 |
| New `services/calendar.ts` + the reminder control in `Settings.tsx` | T21 |

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

**Not in scope:** deploy (T9), README badges (T10), dependency upgrades, renaming
the package (T10).

**Deliverable:** green CI run on the PR itself. `npm ci && npm run verify` is clean
locally.

---

## T1. Catalog → NeetCode 250 with NeetCode 75 / 150 flags and neetcode.io links

**Why:** LeetCode Premium blocks some current links. The owner wants the full
NeetCode 250, with the NeetCode 75 and NeetCode 150 still identifiable inside it.

**Scope**
- Replace `src/data/neetcode150.json` with `src/data/neetcode250.json` (250 rows,
  NeetCode 250 order). Row shape:
  `{ title, slug, neetcodeSlug, difficulty, topics, primaryTopic, lists }`, where
  `lists` is a subset of `["nc75", "nc150", "nc250"]`.
  - `slug` is the **LeetCode** slug (the stable id).
  - `neetcodeSlug` is NeetCode's own slug, which often differs (e.g.
    `contains-duplicate` → `duplicate-integer`), so it **can't be derived** and
    must come from the source list.
- Source all three lists from neetcode.io/practice (reachable from the cloud
  environment). If it can't be fetched reliably, stop and ask the owner for an
  export instead of guessing slugs.
- `CatalogProblem` gains `neetcodeUrl` (`https://neetcode.io/problems/<neetcodeSlug>`)
  and `lists`. `leetcodeUrl` stays. `neetcodeOrder` becomes the 250-list order.
  Add a tiny pure helper `coreRank(problem)`: 0 for nc75, 1 for nc150-only,
  2 for the rest. T3, T4 and T6 all use it for "core first".
- Bump `CATALOG_VERSION` (e.g. `neetcode-250-v1`). `seedCatalog` re-puts the
  problems. The `problems` store indexes don't change, so **no Dexie version bump**.
  Write that reasoning into the PR description.
- Links: `ProblemDetail` and `DailyPlan` get a primary "Solve on NeetCode" link and
  a secondary "LeetCode" link (new tab, `rel="noreferrer"`). Update the
  `DailyPlan` intro copy too. Show a small "75" / "150" tag on problems so the
  user can see which list a problem comes from.
- `src/data/topicTiers.ts`: confirm every `primaryTopic` is mapped. A new topic
  needs a tier.
- New unit test `src/data/catalog.test.ts`:
  - 250 rows, about 150 tagged `nc150` and about 75 tagged `nc75`. Assert the
    exact counts you found.
  - nc75 ⊂ nc150 ⊂ nc250.
  - Unique `id` and `neetcodeSlug`.
  - Every one of the **current 150 ids is still present** and tagged `nc150`
    (guards existing users' data).
  - Every `primaryTopic` is in `TOPIC_TIERS` and in its own `topics`.
  - Difficulty enum is valid, and URLs are well-formed.
- User-visible "150" copy only: badge hints in `constants.ts` ("all 150",
  "75 of the 150") get catalog-neutral wording. Badge **thresholds and semantics
  stay unchanged** (T6 owns them). Also update the README sentence about "the
  150-problem catalog".
- Check the topic map in a browser with the bigger per-topic counts.

**Not in scope:** the 75/150/250 selector (T2), plan ordering (T3), badge
thresholds (T6).

**Deliverable:** the app seeds 250 problems tagged by list. Every NeetCode link in
the plan and detail views opens a free problem page. An existing v4 database keeps
all its progress after the reseed (check it in a browser: log attempts on the old
build, switch to the new build, reload).

---

## T2. Problem-set selector (NeetCode 75 / 150 / 250)

**Why:** some users only have time for the 75, most commit to the 150, and some
want the extended 250. Users should choose their scope, and progress counters
should match that choice.

**Scope**
- New setting `problemSet: 'nc75' | 'nc150' | 'nc250'` in `settings`. Follow the
  shared rule above for `backup.ts`.
  - Default for a fresh install: `nc150`.
  - Default for an existing user with progress: `nc150` too. That's the set they
    were already on, so nothing changes under their feet.
- Show the choice in `Settings` and once on first launch (a one-line picker, not
  a wizard). Changing it never touches stored progress. Out-of-set problems keep
  their history and just aren't shown or recommended.
- Filter the problem list **once**, where it's read from Dexie (one small pure
  helper in `src/services/`, unit-tested), so the daily plan, review queue, topic
  map, mastery counts and badge inputs all see the same set.
  - The review queue still shows due reviews for out-of-set problems the user
    already attempted, so retention never silently stops. Unit-test this.
- Progress labels like "x / N" use the active set's `N`.

**Not in scope:** how the plan picks within a topic (T3), badge changes (T6).

**Deliverable:** switching between 75, 150 and 250 changes the plan, map and
counts accordingly, with history preserved. All directions are verified in a
browser.

---

## T3. Competency engine: topic skill + prerequisite graph

**Why:** the plan gates difficulty on mean review stage across *every* problem in a
topic (`topicMastery` → `maxDifficultyFor` in `dailyPlan.ts`). A bigger set
**dilutes** that mean: on the 250 a user who's good at Trees would be held on Easy
far longer, because there are more untouched Trees problems. On the 75 the gate
opens too fast. Topics are also picked independently, so the plan can push
Advanced Graphs before Graphs makes sense.

**Scope**
- `src/services/skill.ts` (pure, unit-tested). A per-topic skill in `[0, 1]`,
  replayed deterministically from the `attempts` history: an Elo-style update per
  attempt. The attempt quality is the "result" and the problem's difficulty is the
  "opponent rating". Same-day repeats are discounted, mirroring XP. It isn't
  stored anywhere, so it can't drift, and it doesn't depend on set size.
- `src/services/topicGraph.ts` (pure data + helpers). Prerequisite edges between
  the topics, for example Arrays & Hashing → Two Pointers → Sliding Window,
  Trees → Tries, Trees → Backtracking, Trees → Heap, Graphs → Advanced Graphs,
  1-D DP → 2-D DP. Add a test that the graph is acyclic and that every topic in
  `TOPIC_TIERS` appears in it.
- `dailyPlan.ts`:
  - Difficulty ceiling comes from topic skill, not diluted mean stage.
  - A topic whose prerequisites are below a skill threshold gets a **priority
    penalty**, not a hard lock. Users can still open anything from the map.
  - **Target difficulty, not easiest-first.** Topic skill maps to a target
    difficulty (Easy → Medium → Hard). Within a topic, pick problems *at* the
    target first and fall back to easier ones only when none are left. Today's
    easiest-first sort is what keeps users on Easy.
  - Within the target difficulty, order by `coreRank` (T1) and then catalog
    order, so the 75 comes before the rest of the 150, which comes before the
    extra 100.
- All thresholds go in `constants.ts`. Keep the existing struggling rules (the
  priority 0.5 relief and the ceiling using the real stage) or replace them with
  an equivalent that is explicitly tested.
- Extend `dailyPlanSimulation.test.ts` with the shared personas (see
  [Plan quality targets](#plan-quality-targets-enforced-by-simulation-tests)):
  - Meet every T3 target in that table, for all three problem sets.
  - A simulated learner progresses through prerequisites in order.
  - A failing learner isn't flooded.

**Not in scope:** cadence (T4), reinforcement problems (T5), topic-map visuals and
stars (T6), any persisted field.

**Deliverable:** pure modules + tests, with the plan driven by skill and the
graph. No schema change.

---

## T4. Cadence-aware plan: regular, occasional and returning users

**Why:** see [How the plan serves every kind of user](#how-the-plan-serves-every-kind-of-user).
Today the plan doesn't know how often the user practises.

**Scope**
- `src/services/cadence.ts` (pure, unit-tested). Derived from the attempts' active
  dates and a `today` string, never stored:
  - `activeDaysLast28` and `daysSinceLastActive`.
  - A profile:
    - `new`: under 7 days of history.
    - `returning`: `daysSinceLastActive` ≥ 7.
    - `regular`: ≥ 16 of the last 28 days, i.e. 4+ a week.
    - `occasional`: everything else.
  - All thresholds go in `constants.ts`.
- **At-risk review ordering** (shared by the daily plan and the review queue):
  - Rank due reviews by *overdue ratio* = days overdue ÷ the interval that was
    scheduled, which can be derived from `reviewStage`.
  - Keep "weak first" as the primary key, then the ratio.
  - A review 20 days late on a 7-day interval now outranks one a day late on a
    30-day interval. This matters most for occasional users, who are always a
    little late.
- **Profile rules in the plan.** The plan size stays 2–4 and always includes at
  least one new problem.
  - `returning`: a **re-entry plan**.
    - Reviews fill all but one slot, most-at-risk first. The one new slot comes
      from a topic the user already has skill in.
    - A one-line banner says "Welcome back — easing in with reviews".
    - The rest of the backlog stays in the review queue. The plan is never
      inflated.
    - The profile clears itself once the user has practised again.
  - `occasional`: spend scarce sessions on what matters most.
    - New problems come strictly core-first (`coreRank`) across topics, not just
      within a topic.
    - The recency penalty on the current topic is weaker, so they stay in a topic
      until its difficulty ceiling rises instead of hopping between topics every
      session.
  - `regular` (and anyone whose plan is fully logged with no reviews due): a
    **"One more problem"** button. It asks the same selector for the next new
    problem and persists it as a normal `new` recommendation for today, so
    same-day replay stays stable.
- Simulation tests (extend `dailyPlanSimulation.test.ts`) over 12 simulated
  weeks for the shared personas and cadences. Assert the T4 rows of
  [Plan quality targets](#plan-quality-targets-enforced-by-simulation-tests), plus:
  - Every persona gets at least one new problem on every active day, except
    under review overload (12+ due, see the "Review overload" log entry).
  - The plan never exceeds 4 items.
  - The returnee's first plan is review-heavy.
  - The 2-day/week persona's most-overdue weak reviews are served before newer
    ones.
  - Core problems (nc75, then nc150) come first for the occasional persona.

**Not in scope:** reinforcement problems (T5); streak, XP and badges (T6, which
reads `cadence.ts`); changing stage or interval rules (T11).

**Deliverable:** `cadence.ts` + plan rules + the persona simulations, plus the
banner and "One more problem" UI.

---

## T11. Review load: reach mastery with fewer repeats

**Why:** see [Two more gaps found in today's code](#two-more-gaps-found-in-todays-code).
The goal is mastery with as few repeats as the evidence allows, for daily and
occasional users alike.

**Scope** (`src/services/reviews.ts`, pure, unit-tested; the attempt row is
unchanged, so there's no schema change or migration):
- **Late-recall credit.** A strong attempt on a review whose real gap (this
  attempt's date minus `lastAttemptDate`) is ≥ 2× the scheduled interval
  advances **2 stages** instead of 1, capped at stage 5. Remembering after a long
  gap is stronger evidence, and this is what stops occasional users from paying
  extra reviews for being late.
- **Gentler demotion.**
  - A partial attempt drops one stage (minimum 1) instead of resetting to 1. A
    stage-4 problem that needed a hint goes back to 14 days, not 3.
  - A weak attempt still resets to 0.
- **Confident first solve.** The first attempt ever on a problem, solved
  independently and felt *easy*, starts at stage 2 (review in 7 days instead of
  3). That's one fewer repeat on problems the user clearly already knows.
- Keep the same-day freeze (`alreadyAttemptedToday`) and the struggling backoff
  exactly as they are.
- Every rule depends only on the attempt sequence (quality, perceived
  difficulty, dates), so T6's `stagesBeforeEach` replay can reproduce it. Note
  that in the code comment.
- Existing progress rows aren't rewritten. The new rules apply from each
  problem's next attempt. Explain this in the PR.
- Unit tests for each rule, plus the T11 rows of
  [Plan quality targets](#plan-quality-targets-enforced-by-simulation-tests) in
  the shared simulation.

**Not in scope:** the interval ladder itself (`[1, 3, 7, 14, 30]` stays), plan
selection (T3/T4), XP (T6).

**Deliverable:** new stage rules with tests. The simulations show fewer attempts
to mastery and a bounded backlog for the 2-days-a-week persona.

---

## T5. Competency engine: reinforcement problems on repeated failure

**Why:** today a struggling problem only backs off its reviews (2/4/7 days).
Nothing helps the user *build up* to it.

**Scope**
- When a problem in the plan's horizon is `struggling` (or has 2+
  `consecutiveWeak`), the plan includes one **reinforcement** item. Pick an
  easier, already-solved problem from the same topic first, then from a
  prerequisite topic (`topicGraph.ts`). Pick an unsolved Easy from the same topic
  (core-first) if nothing is solved yet. Use at most one per day, and it takes a
  plan slot (the plan stays 2–4 items and respects T4's profile rules).
- Expose the reason on the in-memory `DailyPlanItem` (e.g.
  `reason: 'reinforce'`) and show it in the UI ("Warm-up for *X*"). **Don't** add
  a value to the persisted `RecommendationEvent.kind` enum. Store it as `new` or
  `review` and recompute the reason, so backups and older builds stay compatible.
  Same-day replay must stay stable.
- Unit tests plus a simulation case: 3 failures on a Medium yields a same-topic
  Easy warm-up, and the warm-up stops once the problem is no longer struggling.

**Not in scope:** changes to the struggling backoff ladder, gamification for
comebacks (T6).

**Deliverable:** the warm-up item appears in the plan, with tests.

---

## T6. Gamification aligned to the app's goals and to every practice cadence

**The app's goals:** (1) retain what you learned (spaced review), (2) fix weak
topics instead of avoiding them, (3) log honestly, (4) practise *steadily* (not
necessarily daily). Gamification should pay for exactly those things, for regular
and occasional users alike.

**Where it's misaligned today**
- XP ignores whether an attempt was a successful *spaced recall*. A due review
  that proves retention earns the same as a first try on a new problem, even
  though retention is the product's core idea.
- The streak and its XP multiplier count only *consecutive days*. A user doing a
  steady 3 days a week never gets the multiplier and keeps "losing" a streak,
  which punishes a schedule that's actually fine.
- Volume badges ("attempt 75 / 100") reward breadth over retention, and their
  numbers came from the 150-problem catalog. They don't fit the 75 or the 250.
- `topic-cleared`, `all-mastered` and the map star need *every* problem in a
  topic mastered (passed its 30-day review). On the 250 that's practically
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
    rules (including T11's).
  - A **comeback bonus** on the strong attempt that ends a run of
    `STRUGGLE_THRESHOLD`+ weak attempts.
  - **Consistency multiplier = max(daily-streak tier, weekly-streak tier).**
    - A *weekly streak* is consecutive calendar weeks with ≥ 3 active days.
    - Both streaks are grace-free and replayable from attempt dates.
    - Taking the max means a daily user never loses anything, and a steady
      3-days-a-week user can reach the same tiers.
  - Weak attempts keep earning XP, so honest logging is never punished. Every
    change is **additive or a max()**, so the re-replay can only raise a user's
    XP.
  - **Dexie v5** re-replays XP exactly like v4. Explain the migration impact in
    the PR. `replayXp` stays the single definition, so backup restore picks up the
    new formula for free.
- **Streak display:** the bar shows the daily streak and the weekly streak ("6
  weeks consistent"), so an occasional-but-steady user sees real progress.
- **Badges** (additive, so no earned badge disappears):
  - Retention axis: "Retained 10 / 25 / 50" (problems at stage ≥ 3).
  - Weekly consistency: "4 / 12 / 26 consistent weeks".
  - "Comeback" (first struggling problem turned strong).
  - "Welcome back" (practised again after a 7+ day gap, using T4's `cadence.ts`).
    It rewards returning instead of shaming the gap.
  - "Foundations solid" (every tier-1 topic at T3's skill threshold).
  - `topic-cleared` / `five-topics-cleared` / map star: redefine as "topic
    proficient". Every problem in the topic with `coreRank` ≤ the active set's
    core (the nc75 problems when the set is 75, nc150 otherwise) is at stage ≥ 3.
    Loosening a predicate only means badges can arrive earlier, never be lost.
  - "List complete" badges for the 75, 150 and 250 (every problem in that list at
    least solved).
  - Volume badges: keep the ids. Make the hints reference the active set.
  - Order the shelf retention → consistency → mastery → volume → level.
- Update `BadgeShelf` / `GamificationBar` / `TopicMap` for the new badges, the
  weekly streak and the star. Respect `prefers-reduced-motion`.
- Tests:
  - Replay equals the live award for the new bonuses and the max() multiplier.
  - v5 never lowers XP.
  - A 3-days/week persona reaches the top multiplier tier.
  - New badge predicates work, and the monotonic merge still holds.

**Not in scope:** plan selection (T3/T4/T5), new persisted gamification numbers.
XP stays the only one.

**Deliverable:** new XP rules, weekly streak, badges, map star, the v5 migration,
tests, and a short "why each reward exists" comment block in `constants.ts`.

---

## T7. PWA: installable, offline, persistent storage

**Why:** the app is already serverless. Installing it and running it offline is
mostly packaging. The more important part: browsers can **evict IndexedDB** for
sites that aren't installed or persisted (Safari after about 7 days without a
visit, which hits exactly the occasional and returning users from T4). For a
local-first app, that's silent data loss.

**Scope** (no new dependencies; a hand-written service worker is ~60 lines):
- `public/manifest.webmanifest`: name "LeetCode Master", short name, `display:
  standalone`, theme and background colours from `tokens.css`, icons 192 / 512 /
  maskable. Draw an SVG mark and export the PNGs once via the pre-installed
  Playwright Chromium (no new dependency), then commit them. Link the manifest
  and add the `theme-color` meta in `index.html`.
- `public/sw.js`: precache `index.html` on install. Use cache-first for
  same-origin hashed assets and network-first with cache fallback for
  navigations. Clean up old caches on activate. Every path is **relative to the
  registration scope** (`vite.config.ts` uses `base: './'`, and T9 serves the app
  under `/leetcode-master/`).
- Register the worker only in production builds (`import.meta.env.PROD`). When a
  new worker is waiting, show a small "Update available — Reload" control.
- On startup, call `navigator.storage.persist()` once, wrapped in try/catch. Show
  the result in Settings ("Storage: persistent / may be cleared by the
  browser"). That status line also says to export backups regularly.
- Browser check: `npm run build && npx vite preview`, install, go offline,
  reload. The app works and data is intact.

**Not in scope:** deploy (T9), backup reminders (T8), renaming other UI text (T10).

**Deliverable:** a Lighthouse-installable build that works offline, plus a
persistent-storage request.

---

## T8. Backup hardening

**Why:** export and restore exist. What's missing is the habit, and safety on the
destructive path.

**Scope**
- Export filename gets the date: `leetcode-master-backup-YYYY-MM-DD.json`.
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

## T9. Live demo on GitHub Pages

**Scope**
- `.github/workflows/deploy.yml`: on push to `master`, run `npm ci && npm run
  verify`, then deploy `dist/` with the official Pages actions. The owner enables
  Pages (Source: GitHub Actions) in repo settings. Ask them, because the session
  can't do it.
- Confirm the relative `base` works under `https://<owner>.github.io/leetcode-master/`
  and that T7's service worker and manifest resolve there (install + offline
  check on the live URL).
- Record the live URL in this file's log for T10.

**Not in scope:** custom domain, README (T10).

**Deliverable:** a working public URL.

---

## T10. Open-source packaging

**Scope**
- **Name: LeetCode Master** (already decided).
  - Apply it to the UI header (currently "LeetCode Tracker"), `<title>`, the
    `package.json` name (`leetcode-master`), the backup error message, the
    `Settings` copy, and `CLAUDE.md` (currently "PatternPilot").
  - **Never rename the Dexie database name `pattern-pilot`.** That would orphan
    every user's data. Add a code comment saying so.
- **README** for the community:
  - The retention-decay problem and how the loop works.
  - The three problem sets (75 / 150 / 250).
  - How it adapts to regular, occasional and returning users.
  - A Mermaid architecture diagram of the local-first storage (UI → hooks →
    pure services → Dexie → IndexedDB, plus backup and the service worker).
  - A screenshot or GIF, the live demo link (T9), and install-as-app
    instructions.
  - The privacy statement (no server, no telemetry).
  - A disclaimer that it's not affiliated with LeetCode or NeetCode and stores
    only titles and links, never problem text.
- **CONTRIBUTING.md**:
  - Setup, `npm run verify`, and the commit and PR convention.
  - How to propose a catalog change: edit the JSON, and `catalog.test.ts` must
    pass.
  - How to propose a topic-graph edge or a threshold change, with a simulation
    test.
- **LICENSE**: ask the owner. For "not for commercial use", the candidates are
  PolyForm Noncommercial 1.0.0 or CC BY-NC 4.0; for open source, MIT. State in
  the README that a non-commercial license is "source-available".
- Minimal `.github/ISSUE_TEMPLATE/` (bug, catalog fix) and
  `pull_request_template.md`.
- A CI badge (T0) in the README.

**Deliverable:** a repo a stranger can understand, try and contribute to in five
minutes.

---

## Phone layout fix (2026-10-19, owner request)
- What shipped:
  - The shell no longer overflows a phone. `main` has an explicit `minmax(0, 1fr)` column; before, the badge strip's max-content width made the app ~614 px wide on a 390 px screen, clipped on the right.
  - Phone header: title + Settings on one row, XP and badge strips full width.
  - Compact stats; an open side panel replaces the map; an open problem hides the stats and search.
  - 44 px tap targets on touch screens (links, triggers, problem titles); larger invisible hit area on route stops.
  - Portrait route on phones (`PORTRAIT_SHAPE` in `topicPath.ts`): labels went from ~4-6 px to ~10 px, stops from ~20 px to ~35 px. It scrolls inside its canvas and opens at the furthest stop reached.
- QA (Chromium, production build): 320, 390, 768 and 1280 px wide. No page scroll and no element past the screen edge except the badge strip, which scrolls in its own box. No touch target under 32 px on phones. Every route stop reachable and tappable (Bit Manipulation, last stop, opens its panel). Desktop route unchanged. Tests: portrait layout bounds, the curve, and a label-collision check for both shapes.
- Not covered: a phone held sideways (e.g. 844×390). It is wider than the breakpoint, so it gets the desktop layout, and the header and stats leave almost no room for the map. Not tested on a real phone, Safari or Firefox.

## T12. Session time: plan estimate, time budget, "your note" before a review

Done; see the session log.

## T13. Light review

Done; see the session log. The original brief follows.

**Problem:** every review asks for a full re-solve (~10–30 min), and reviews are
~88% of plan items. **Scope:** offer "I recalled the approach" (3–5 min) on a
review, with a full re-solve only if that recall fails. Model it as an `Attempt`
the review rules in `reviews.ts` can replay (XP must still be reconstructible from
`attempts`). **Gate:** before shipping, extend `dailyPlanSimulation.test.ts` with
a recall-decay model and show attempts-to-mastery and the backlog bound don't get
worse. If they do, ship it only for stage ≥ 3 reviews. **Not in scope:** changing
the overload rule.

## T14. Finish forecast + weekly practice-days goal

Done; see the session log. The original brief follows.

**Scope:** (1) "At this pace you finish the NeetCode 75 in about N weeks",
from the user's own new-problems-per-active-week rate (pure, in `services/`, no
wall-clock reads). (2) An optional "N days a week" goal stored as a setting, with
progress shown next to the existing weekly streak. Reuse `streak.ts`; don't add
a second weekly-streak definition.

## T15. End-of-session wrap-up

**Scope:** when every plan item is logged, show "Done for today": items done,
minutes logged, XP earned today, the next review date. The "One more problem"
button stays, below it. Display only; no new stored state.

## T16. Goal plans

**Scope:** (1) an interview date that picks the set and pace to fit the time
left, shows the hours that will take up front, and favours tier-1 topics; (2)
"skip Easies" for experienced users, through `problemsInSet` so the plan, map
and counts follow automatically. Switching never touches stored progress.
**Not in scope:** role-based lists (frontend / backend / data). There is no
verified data on which problems each role gets, and the app can't fetch any.
See the parking lot.

## T17. Built-in attempt timer

**Why:** the duration field is manual, so it's almost always empty. T12's
per-user time estimates then never leave the defaults, and the user has to
guess the minutes when logging.

**Scope**
- A "Start timer" control on the problem view. While it runs, it shows the
  elapsed minutes. Logging the attempt fills `durationMinutes` with the rounded
  elapsed minutes. The user can still edit the field, and the value is clamped
  to the form's allowed 1–600.
- Elapsed-time math goes in a pure `services/attemptTimer.ts`, unit-tested: it
  takes start and stop timestamps and returns whole minutes, with no clock reads
  inside.
- The start time survives a reload and a trip to NeetCode in another tab.
  - Store it in `localStorage`, keyed by problem id and wrapped in try/catch.
  - It's a per-device convenience, not app data: no Dexie table, no backup
    field.
  - Saving the attempt clears it, and so does a start time older than 12 hours.
- "Start" sits next to the NeetCode / LeetCode buttons, so opening the problem
  and starting the clock is one motion.

**Not in scope:** pause/resume, per-step timing, any change to how XP or review
stages use duration (they don't).

**Deliverable:** timer + unit tests. Browser check: start, open NeetCode, come
back after a few minutes, log, and the duration is filled in.

## T18. Quick log from the plan

**Why:** logging every item means opening the full problem view and filling a
form, and that daily friction is what makes people stop logging.

**Scope**
- Each unlogged plan item gets three buttons: "Solved it", "Needed a hint" and
  "Couldn't solve it".
- A pure `services/quickLog.ts` maps each button to a full `AttemptInput`
  using the same rules as `attemptForm.ts`, so quality derives exactly as from
  the form. Unit-test that each button yields the same quality as the
  equivalent form submission.
  - "Solved it" → `solved_independently` + `manageable` (strong).
  - "Needed a hint" → `solved_with_hint` + `small_hint` (partial).
  - "Couldn't solve it" → `could_not_solve` (weak).
- Saving goes through `saveAttempt`, so it's one transaction like any other
  attempt. If T17's timer is running for that problem, its minutes are
  included.
- After a quick log the item shows "Logged · add a note" (opens the full form
  to edit nothing but the note) and a one-tap Undo for the next 10 seconds.
  - Undo deletes that attempt and restores the previous progress row in one
    transaction. XP is recomputed with `replayXp`, as backup restore does.
  - Explain that in the PR, because it's the only path that removes an
    attempt.
- The full form stays the way to record anything more detailed.

**Not in scope:** changing the form, bulk logging several items at once.

**Deliverable:** buttons + undo + tests (quality mapping, undo restores
progress and XP exactly).

## T19. "Why this problem today?"

**Why:** the plan already knows why it picked each item, but it doesn't say.
A one-line reason makes the plan feel like coaching instead of a random list,
and it explains a review-only day.

**Scope**
- A pure `services/planReason.ts`, unit-tested, returns one short line per
  `DailyPlanItem`:
  - "Review · 5 days overdue"
  - "Review · last attempt needed a hint"
  - "New · weakest topic you're working on"
  - "New · next stop on the route"
  - "Warm-up for <problem>" (T5)
  - "Reviews first: N more to clear before new problems" (overload)
- It reads only what selection already computed (progress, skills, cadence)
  and adds no stored state. It's recomputed on every render, so same-day replay
  stays stable.
- Shown as a muted line under each item in `DailyPlan.tsx`.
- **Must not** change `RecommendationEvent.kind` or selection itself. If the
  exact reason a stored item was picked can't be recovered on replay, show the
  best true statement ("Review · due today"), never a guess.

**Not in scope:** changing selection, explanations longer than one line.

**Deliverable:** reasons + tests covering every branch.

## T20. Import prior history

**Why:** most people install the app after already solving part of the list.
Today they either re-solve everything from scratch or log fake attempts one by
one.

**Scope**
- A one-time screen, reachable from Settings and offered on first launch next
  to the problem-set picker: "Mark problems you already know". It shows a
  checklist by topic, with a "select whole topic" option.
- Marked problems get a `progress` row only: status `solved`, `reviewStage` 2,
  next review spread over the next 7–21 days, so they don't all come due on the
  same day.
  - **No `Attempt` rows.** Imports earn no XP, no streak and no badges.
  - XP stays reconstructible from `attempts` alone, and nobody can farm XP.
  - The spreading rule goes in a pure `services/importKnown.ts`, unit-tested.
- Undo: a "Remove imported marks" button deletes progress rows that have no
  attempts. That set is identifiable without any new field.
- Known gap to document: topic skill (`skill.ts`) replays only attempts, so an
  imported topic still starts at Easy for new problems until the first real
  attempts there. T16's "skip Easies" covers users for whom that matters.

**Not in scope:** importing from a LeetCode account (rejected, see Decisions),
importing files from other trackers.

**Deliverable:** import screen + undo + tests. Browser check: import a topic;
its reviews arrive over the following weeks, and XP is unchanged.

## T21. Calendar reminder

**Why:** a practice habit needs a nudge, and push notifications need a server.
A recurring calendar event gives most of the value with no network.

**Scope**
- Settings → "Add practice reminder to my calendar": pick days of the week and
  a time, then download a `.ics` file.
- A pure `services/calendar.ts`, unit-tested, builds an RFC 5545 VEVENT:
  - Weekly `RRULE` with `BYDAY`.
  - Floating local `DTSTART`.
  - Fixed 45-minute duration, or the T12 time budget when one is set.
  - A deterministic `UID`.
  - A short description that links the deployed app URL when known, otherwise
    none.
- If T14's weekly goal exists, prefill the day count from it.
- Nothing is stored. The file is generated on demand.

**Not in scope:** push notifications, editing an event already added (the user
deletes it in their calendar and downloads a new one).

**Deliverable:** generator + tests (golden `.ics` text for a sample, line
endings `\r\n`, escaping) + a check that the file imports into a calendar app,
done by the owner since the session can't.

## Parking lot

Ideas noticed during sessions that aren't in any task. Add one line each, with
your task ID. Don't implement them.

- (T12) Role-based plans (frontend / backend / data). Only as an owner-reviewed suggestion list, labelled "picked because these topics are common for the role", never presented as fact.
- (T12) Under review overload, one new Easy every other day, or a separate "missed reviews" pile. A quick trial of adding new problems during overload grew the yearly backlog to 117, so any version must re-run the year-long backlog test.
- (T12) Changing the budget after logging something re-plans only new problems; due reviews that dropped out stay in the review queue rather than coming back into the plan. Revisit if users find that confusing.
- (T20) The T14 finish forecast counts imported problems as "remaining" (it reads attempts only), so it overstates the weeks left for someone who imported a lot. Fix by also treating progress rows with no attempts as done.
- (T20) A very large import (over ~180 marks) puts 12+ reviews on a day inside the 7-21 day window, which pauses new problems. A wider window for big imports, or a per-day cap, would avoid that.

## Session log

Each session fills in its own entry in its PR.

### T0
- Status / PR / date: Done / pushed straight to `master` at the owner's request / 2026-10-19
- What shipped: `.github/workflows/ci.yml` (now manual-only via `workflow_dispatch`, disabled at the owner's request; was PR + push to `master`: Node 22.12, `npm ci`, `npm run verify`). Every `"latest"` in `package.json` is now a caret range at the version the lockfile already resolved (no upgrades). `@vitejs/plugin-react` moved to `devDependencies`. `jsdom` removed as a direct dev dependency. `engines.node >=22.12` added. Lockfile regenerated with `--package-lock-only`; no resolved versions changed.
- Decisions & deviations: `jsdom` still appears in the lockfile as an optional peer of `vitest`; it is not installed as a direct dependency.
- Follow-ups: restore the `pull_request` and `push: branches: [master]` triggers in `ci.yml` to re-enable CI.

### T1
- Status / PR / date: Done / pushed to `master` at the owner's request / 2026-10-19
- What shipped: `src/data/neetcode250.json` replaces `neetcode150.json` (250 rows in neetcode.io order; `lists` flags: 75 `nc75`, 150 `nc150`, 250 `nc250`; `neetcodeSlug` per row). `CatalogProblem` gains `neetcodeUrl` and `lists`; `CATALOG_VERSION` = `neetcode-250-v1`. New `src/services/coreRank.ts` (`coreRank`: 0 = nc75, 1 = nc150 only, 2 = rest; `listTag`: "75" / "150" / null). `ProblemDetail` and `DailyPlan` show "Solve on NeetCode" plus a secondary "LeetCode" link (new tab, `rel="noreferrer"`) and a 75/150 tag (the side-panel rows carry the tag too); `DailyPlan` intro copy updated. Badge hints in `constants.ts` and the README catalog sentence made catalog-neutral. New `src/data/catalog.test.ts`: 250 / 150 / 75 counts, subset nesting, unique ids / urls / order, all 150 legacy ids still present and tagged `nc150`, every `primaryTopic` tiered and in `topics`, difficulty enum and URL shape, `coreRank` / `listTag`.
- Decisions & deviations: **Source:** neetcode.io/practice is an Angular app, so I read the problem table out of its published JS bundle (parsed as data, not executed). It has `neetcode250` / `neetcode150` / `blind75` flags and `ncLink` per problem: exactly 250 / 150 / 75, nc75 ⊂ nc150 ⊂ nc250, no duplicate slugs. All 150 legacy ids are in it, tagged `nc150`. **Topic exceptions (not guessed):** neetcode.io files `generate-parentheses` under Backtracking and `reconstruct-itinerary` under Advanced Graphs; the old catalog had Stack and Graphs. I kept the existing `primaryTopic` for both so existing users' topic grouping doesn't shift; revisit if the owner wants neetcode.io's grouping. **No Dexie bump:** `problems` indexes are unchanged and `seedCatalog` re-`put`s on a `CATALOG_VERSION` change, so rows are rewritten in place; progress and attempts are keyed by the unchanged LeetCode slug. **Plan side effect:** until T2 adds the selector, the daily plan draws from all 250. `dailyPlanSimulation` "progresses to tier-2 and tier-3" horizon went 90 → 150 days (tier 3 arrives after 120-150 days now); no plan rule changed, T3/T4 own that behaviour. **QA:** old build (v4, 150 problems, one attempt written) → new build on the same origin: 250 problems, progress and attempt intact, Dexie still v4. Plan and detail links point to neetcode.io (`rel="noreferrer"`, `_blank`). Page never scrolls at 1280 and 700 px (map, daily-challenge modal, topic panel, problem detail). Problem pages weren't opened on neetcode.io; the slugs come from its own table.
- Follow-ups: T2 should filter by `lists`. T3 / T4 / T6 use `coreRank`. Cosmetic: the `badge-list` tag uses the accent colour; T6 may restyle it.

### T2
- Status / PR / date: Done / pushed to `master` at the owner's request / 2026-10-19
- What shipped: `problemSet` setting (`nc75` | `nc150` | `nc250`; added to `AppSettingKey` and `settingKeys` in `backup.ts`). New `src/services/problemSet.ts` (`parseProblemSet`, `problemsInSet`, labels, `DEFAULT_PROBLEM_SET = nc150`) with `problemSet.test.ts`; `src/db/problemSet.ts` (`saveProblemSet`); shared `ProblemSetPicker` used by a one-line first-launch banner in the header (shown until a choice is stored) and by a "Problem set" card in Settings. `App.tsx` filters the catalog once (`problems`) and feeds that to the plan, map, mastery, search and "x / N" counts; the unfiltered `allProblems` goes only to `dueReviewQueue` (Workbench + SidePanel review panel). `saveAttempt` computes badge inputs over the active set.
- Decisions & deviations: **Default** is `nc150` for fresh installs and existing users alike (the set they were on). Existing users with no stored choice also see the banner once; picking, or Settings, stores it. **Out-of-set reviews:** they stay in the review queue and the "N for review" count (both read all progress/problems), but the daily plan is built from the active set only, so they are not recommended in the plan. **Badges:** `saveAttempt` passes in-set problems, so predicates like `all-mastered` now key on the active set (a loosening: badges can only arrive earlier, none is ever lost; T6 owns the redefinition). **No Dexie bump:** the setting is a plain `settings` row. **QA** (Chromium, 1280 and 700 px): banner on first launch, map totals 75 / 150 / 250 after each switch, page never scrolls (map, Settings overlay), an attempt logged on a 250-only problem stayed in IndexedDB (1 attempt, 1 progress row) and the problem hid at 75 and reappeared at 250. The "N for review" count for an out-of-set due review was covered by a unit test, not a browser run.
- Follow-ups: T6 should redefine the badge predicates against the set. The first-launch banner shows for existing users too; if the owner wants it hidden for anyone with progress, key it on attempts.

### T3
- Status / PR / date: Done / pushed to `master` at the owner's request / 2026-10-19
- What shipped: `src/services/skill.ts` (`topicSkills` replays per-topic skill in [0, 1] from `attempts`: Elo-style, quality is the result, difficulty rating the opponent, same-problem same-day repeats weighted 0.25; `targetDifficulty`). `src/services/topicGraph.ts` (`TOPIC_PREREQUISITES`, `prerequisitePenalty`). `dailyPlan.ts`: the mean-stage ceiling (`maxDifficultyFor`) is gone; new problems aim at the skill's target difficulty (target, then easier, then harder only if nothing easier is left), ordered by `coreRank` then catalog order. A topic with an unmet prerequisite gets a 0.5 priority penalty, never a lock. `selectDailyPlan` takes optional `attempts` and `skillProblems` (the unfiltered catalog, so out-of-set history still counts); `useDailyPlan` passes them. Thresholds in `constants.ts`. `topicMastery` stays for the map and for topic priority. Tests: `skill.test.ts` (skill curve, graph acyclic and covers every tiered topic) and new T3 sections in `dailyPlanSimulation.test.ts` for 75 / 150 / 250.
- Decisions & deviations: **Thresholds:** Medium at skill 0.25 (two strong Easies from a standing start), Hard at 0.6 (at most three strong Mediums from the Medium threshold). **Failing learner:** a weak result drops skill sharply, so the ceiling falls back; this replaces the old "struggling uses real stage" rule. A topic whose last attempt was weak (skill still below Medium) takes a 0.6 priority penalty and stops counting as an unmet prerequisite for its dependents; without that the dependents were penalised and the plan stayed on the failing topic (the blind-spot test hit 0.255 against its 0.25 cap). **Fallback:** a topic with no Easy can still serve Medium or Hard from a standing start. **Personas:** only strong-always, struggling and prerequisite order are simulated, at daily cadence; the typical persona and the 4-day / 2-day / gap cadences are left to T4's tests. **QA:** `npm run verify` passes; the app loaded in Chromium at 1280 and 700 px with no page scroll and no page errors. Skill-driven plan choices were checked by the simulation tests, not by hand in the browser (today's stored plan replays on reload).
- Follow-ups: T4 adds the remaining personas and cadences. `topicMastery`'s diluted mean still drives topic priority and the map; revisit if priority should follow skill.

### T4
- Status / PR / date: Done · 2026-10-19 · pushed from `claude/leetcode-master-roadmap-znri4s`
- What shipped:
  - `cadence.ts` (+ tests): profile `new` / `returning` / `regular` / `occasional` derived from attempt dates. Only days *before* today count, so the plan's shape doesn't change when the first attempt of the day is logged.
  - `dueReviewQueue` ranks within a quality by overdue ratio (days overdue ÷ the interval it was scheduled for). The daily plan and the review queue panel both use it.
  - Returning: re-entry plan (up to 3 reviews + exactly 1 new problem, from a topic with skill) and a "Welcome back" banner. The backlog stays in the review queue.
  - Occasional: new problems strictly core-first across topics (nc75, then the rest of nc150, then the rest), and a milder recent-topic penalty (0.7 vs 0.35).
  - Regular, or anyone with a fully logged plan and nothing due: a "One more problem" button (`selectExtraProblem`), stored as an ordinary `new` recommendation.
  - Persona simulations (fast and typical learners × daily / 4 days a week / 2 days a week / 3 weeks + 14-day gap, 12 weeks each) in `dailyPlanSimulation.test.ts`.
- Decisions & deviations:
  - "Regular" is 4+ days a week on average over `min(28 days, history)`, i.e. 16 of 28 days once there's a month of history. The fixed 16-of-28 rule made a *daily* newcomer count as occasional for two weeks (it broke the T3 difficulty targets in simulation), so it was replaced.
  - No schema change, no new persisted field. `DailyPlanItem` and `RecommendationEvent.kind` are unchanged.
  - The "never more than four items" target is for the automatic plan. "One more problem" is an explicit user action and may take it to 5+.
  - The T4 backlog assertion became a baseline report (printed by the last persona test), because T11 owns the bound.
- Follow-ups:
  - **Baseline for T11.** Due-review backlog after 12 simulated weeks, typical learner: daily max 66 (end 66), 4 days/week max 40 (end 40), 2 days/week max 20 (end 16), gap-then-resume max 46 (end 46). The backlog grows without bound for a daily user, so T11's "backlog stays bounded" target needs real work, not just late-recall credit.
  - QA note: Dexie live queries refresh one at a time, so a page that's open while history is written briefly plans from half-updated data. The same-day replay hides it in normal use.

### T11
- Status / PR / date: Done · 2026-10-19 · pushed to `master` at the owner's request
- What shipped: `progressAfterAttempt` (`reviews.ts`) has three new stage rules, thresholds in `constants.ts`: **late-recall credit** (a strong attempt at least 2× the scheduled interval after `lastAttemptDate` advances 2 stages, capped at 5; the scheduled interval is `nextReviewDate - lastAttemptDate`, so it also holds for the struggling backoff); **gentler demotion** (partial = one stage down, minimum 1; weak still resets to 0); **confident first solve** (first attempt ever, strong and felt `easy` → stage 2, review in 7 days). The function takes a new optional last argument `perceivedDifficulty`; `saveAttempt` passes it. The same-day freeze and the struggling backoff are untouched. Unit tests for every rule in `reviews.test.ts`; T11 simulation section in `dailyPlanSimulation.test.ts`.
- Decisions & deviations: **No migration:** existing `progress` rows are not rewritten; the new rules apply from each problem's next attempt. **Replay (T6):** every rule is a function of the attempt sequence (quality, perceived difficulty, dates), noted in the code comment. **"Not in the plan on two active days in a row"** is tested as two *consecutive calendar days*: a 3-day review of a partial attempt legitimately lands on the next active day of a 4-days-a-week user. **Measured (12 weeks, 250 set; before → after):** typical learner backlog max: daily 66 → 39; 4 days/week 40 → 27; 2 days/week 20 → 21 (flat: that persona practises only ~24 days, so there is little to compress; bound asserted at 25); gap-then-resume 46 → 32. Mean attempts to mastery, fast learner: daily 5.00 → 4.00, 4 days/week 5.00 → 4.00, 2 days/week 5.00 → 3.86, gap 5.00 → 3.35. The typical learner went from 0 mastered problems to 2–19 (3.4–4.4 attempts). A strong-every-time learner never needs more than 5 attempts at any cadence, and the 2-days persona needs no more than the daily one. **Backlog caveat (corrected, see the "Review overload" note below):** this said the daily persona's backlog "plateaus near 35–40". That was true at 12 weeks but wrong over a longer horizon: for the typical learner it kept growing (daily 44 @12w → 114 @26w, peak 163; 4 days/week peak 133; 2 days/week peak 56). T11's stage rules alone do not bound the backlog. **QA:** `npm run verify` passes; in Chromium (1280 and 700 px) a first solve logged as "Comfortable" wrote `reviewStage: 2`, next review +7 days, and the page never scrolled. Run once on the same weak-return test: the weak-problem "at most 3 in a row" check failed on the old code (4) and passes now.
- Follow-ups: T6's `stagesBeforeEach` replay must use these rules (it needs `perceivedDifficulty` and `attemptedOn` per attempt).

### Review overload (follow-up to T4/T11, gap closed 2026-10-19)
- Board check: T6 was already marked Done on `master`. Code confirms it shipped (`attemptXpAwards`, `stagesBeforeEach`, `weeklyStreakEndingOn`, Dexie v5), so the board needed no change.
- Why: a plan capped at four items that always adds ≥ 1 new problem cannot clear its own reviews (each new problem spawns ~5). Measured over 52 simulated weeks, typical learner, before: backlog peak daily 163, 4 days/week 133, 2 days/week 56. The fast learner was already bounded.
- What shipped: `REVIEW_OVERLOAD_DUE = 12` / `REVIEW_OVERLOAD_SLOTS = 4` in `constants.ts`; `planSlots` returns 4 reviews and 0 new problems at 12+ due. The plan stays 2-4 items and never shrinks as the backlog grows. A `returning` user still gets the re-entry plan (3 reviews + 1 new). "One more problem" is not offered while overloaded. `DailyPlan` says "Reviews are piling up — new problems are paused until you are caught up."
- Measured after (52 weeks, typical learner): peak 25 / 21 / 18 (daily / 4 days a week / 2 days a week); fast learner peak ≤ 17. Cost: fewer new problems for a learner who fails a lot (daily typical learner touches ~108 problems in a year instead of 250, but ends with ~8 due instead of 87). Alternatives measured and rejected: 4 reviews + 1 new at 12+ due (plan of 5; peak 117 daily, still grows for 4 days/week), 3 reviews + 0 new (similar bound, plan shrinks as backlog grows, breaking the monotonic-plan rule).
- Tests: `dailyPlan.test.ts` (overload plan, replay stability, monotonic sizes), `dailyPlanSimulation.test.ts` (persona tests now allow an all-review day when ≥ 12 are due; new 52-week bound test, max ≤ 30).
- Re-measured 2026-10-19 (same harness, 250 set, typical learner, daily): 12-week peak 66 before T11 → 44 with T11 alone → 21 with the overload rule. With T11 alone the 52-week peak is 163 (still 87 due at the end), so T11 slowed the growth but did not bound it. The cost: the daily typical learner spends 265 of 364 days in overload (no new problems). Exceptions: a `returning` re-entry plan keeps its one new problem, and a T5 warm-up that is an unsolved Easy is stored as `new`. Measured over a year that adds a new problem on 1 (daily), 0 (4 days a week) and 6 (2 days a week) overload days. While the warm-up is in the plan, the "piling up" banner is hidden.
- Not verified: the threshold 12 was tuned on these personas only; a different learner mix may want a different value. Changing the "at least one new problem" rule is a product decision: it is documented in the README and `CLAUDE.md`.

### T5
- Status / PR / date: Done · 2026-10-19 · branch `claude/leetcode-master-roadmap-znri4s`
- What shipped: new pure `src/services/reinforcement.ts` (`reinforcementTargets`, `selectReinforcement`, `warmUpTargetFor`) with `reinforcement.test.ts`; thresholds `REINFORCE_CONSECUTIVE_WEAK` (2) and `REINFORCE_MIN_GAP_DAYS` (2) in `constants.ts`. `DailyPlanItem` gains in-memory `reason?: 'reinforce'` and `reinforces?: CatalogProblem`. A problem that is `struggling` or has 2+ `consecutiveWeak` gets one warm-up per day: a solved easier problem in the same topic (hardest first), else a solved problem from a prerequisite topic (`topicGraph.ts`), else an unsolved same-topic Easy (core-first). `DailyPlan.tsx` shows "Warm-up · <title>" and "Builds toward <target>". A simulation case in `dailyPlanSimulation.test.ts` covers 3 failures on a Medium → same-topic Easy warm-up → none once the Medium is solved.
- Decisions & deviations: **Slot rule:** the warm-up takes a new-problem slot when there are two (one new problem always remains), is added on top while the plan has room, and replaces the last review when the plan is already at 4. So the plan stays 2–4 items with ≥ 1 new problem, and the warm-up is not counted as a due review. **Stored as `new` or `review`:** a solved warm-up is stored as `review`, an unsolved Easy as `new`; no change to `RecommendationEvent.kind`, the schema or backups. **Reason is recomputed, so approximate on replay:** a stored item is labelled a warm-up when it is not a still-due review and relates to a struggling problem (easier same-topic, or a prerequisite-topic problem no harder, or a same-topic Easy); at most one item is labelled. A real easier same-topic review that has already been logged (so no longer due) can therefore be labelled a warm-up while a problem is struggling. Same-day replay keeps the stored items; when the target recovers mid-day the label goes and the plan may top up one new problem. **Rest rule:** a solved candidate attempted yesterday or today is skipped so it is not served two days running. **Only in-set problems** are candidates; skipped (24 h) problems are excluded. **QA** (Chromium, 1280 and 700 px): seeded a struggling 3Sum and a solved Valid Palindrome; the plan showed "Warm-up · Valid Palindrome / Builds toward 3Sum" (kept after reload), page never scrolled, no page errors.
- Follow-ups: T6 may want a "comeback" reward when a struggling problem is finally solved. The "returning" cap of exactly one new problem can see two when the warm-up is an unsolved Easy (rare: nothing solved in that topic or its prerequisites).

### T6
- Status / PR / date: Done · 2026-10-19 · branch `claude/leetcode-master-roadmap-znri4s`
- What shipped:
  - **XP** (`gamification.ts`, `constants.ts`): a retention bonus (+2/4/6/8/10 by prior stage 1-5) on a strong or partial first-of-day attempt on a due review; a comeback bonus (+25) on the strong attempt that ends 3+ weak ones; the consistency multiplier is `max(daily tier, weekly tier)` (weekly tiers 2 / 4 / 8 consistent weeks → ×1.1 / 1.25 / 1.5). Weak attempts keep their base XP. New pure `stagesBeforeEach` replays each attempt's prior stage through `progressAfterAttempt` (T11's rules). `attemptXpAwards` is the single fold; `replayXp` sums it and the live path (`awardAttemptXp`) reads the new attempt's entry from it, so live and replay cannot drift.
  - **Weekly streak** (`weeklyStreakEndingOn` in `streak.ts`): consecutive Monday-start weeks with 3+ active days, grace-free, the week in progress never breaks it. Shown as "N weeks consistent" beside the daily streak, and in the XP chip's tooltip.
  - **Dexie v5**: re-replays XP with the new formula via `xpAfterReplay` (`max(stored, replay)`).
  - **Badges** (25, was 13; ids kept, order retention → consistency → mastery → volume → level): `retained-10/25/50` (stage ≥ 3), `weeks-4/12/26`, `comeback`, `welcome-back`, `foundations-solid`, `list-75/150/250`. `topic-cleared` / `five-topics-cleared` are now "topic proficient": every core problem of the active set at stage ≥ 3 (core = nc75 when the 75 is active, nc150 otherwise), defined once in `proficientTopics` (`mastery.ts`) and shared with the map star. `half-catalog` / `century` scale to the active set; `badgeHint` quotes the set. Marks for every new badge in `BadgeShelf`.
  - **Map**: the star and "N of 18 topics proficient" use proficiency; the ring still shows honest mastery.
  - Tests: replay equals live for seeded random histories, v5 ≥ v4 total, a 3-days-a-week learner reaches ×1.5, weekly-streak edge cases (week boundary, year boundary, in-progress week), every new badge predicate, proficiency and hints.
- Decisions & deviations:
  - **Retention bonus needs the review to be due** (attempt date on or after the replayed `nextReviewDate`), not just prior stage ≥ 1. The roadmap says "prior stage ≥ 1"; without the due check a user could farm the bonus by redoing a stage-4 problem the next day. It is first-of-day only, so a same-day repeat never earns it.
  - **Replay is the definition of prior stage.** The live path does not read the stored `progress` row, so XP is the same for a user whose rows predate T11's rules. Stored rows are untouched.
  - **Weekly tiers** (2 / 4 / 8 weeks) were chosen so 8 steady weeks of 3 days reach the same ×1.5 ceiling the daily tiers reach at 14 days.
  - **Volume badges:** `half-catalog` = half the active set; `century` = 100 attempted problems, or the whole set when it has fewer than 100 (so the 75 can earn it). Counts are over in-set problems; stored badges are never removed when the set changes. Ids unchanged; labels for the proficiency badges changed ("Topic proficient").
  - **List-complete badges read the whole catalog**, so finishing the 150 counts while the 75 is active.
  - **`foundations-solid`** uses `PREREQ_SKILL_THRESHOLD` (T3's skill threshold) over the tier-1 topics present in the active set.
  - **New badges are not backfilled by the v5 migration**; they arrive on the next saved attempt (monotonic union, nothing already earned changes). The map star and the weekly streak are derived, so they appear immediately.
  - **QA** (Chromium; old v4 build seeded with 29 attempts through raw IndexedDB, then the new build on the same origin): upgraded in place to Dexie v5, all attempts kept, XP 543 → 723 (never lower), "8 weeks consistent" and the ×1.5 chip show, the star lands on Arrays & Hashing, 25 marks render, volume hint quotes "NeetCode 150". A live attempt through the form earned +33 XP (20 + stage-1 retention 2, ×1.5) and added `weeks-4`, `welcome-back`, `comeback`, `topic-cleared`, `first-solve` and nothing else. IndexedDB XP equalled `replayXp` of the stored attempts after the migration and after the live save. The page never scrolls at 1280 and 700 px; the badge shelf stays inside its box. No console errors. Follow-up QA, same seeded database: export → restore of a backup whose payload carries stale XP (100) rebuilds XP from the attempts (756, not 100) and keeps the payload badges; reset wipes attempts and XP; restoring the export brings back all 30 attempts, progress, XP and badges, and the weekly streak and map star show again; a bad backup is rejected inline with data untouched. The level pulse, XP sweep and badge reveal animate normally and are all off under `prefers-reduced-motion: reduce`.
- Follow-ups: the header still says "LeetCode Tracker" (T10). `restoreBackup` always rebuilds XP from the attempts, so a restored backup picks up the new formula; its badges come from the payload and top up on the next attempt. The daily-streak tiers still count only consecutive days (unchanged by design: the weekly tier is the max() alternative).

### T7
- Status / PR / date: Done · 2026-10-19 · branch `claude/leetcode-master-roadmap-znri4s`, merged to `master` at the owner's request
- What shipped: `public/` (manifest, SVG mark + 192/512/maskable PNGs exported once via Playwright Chromium, hand-written `sw.js`); `src/pwa.ts` (production-only registration, waiting-worker tracking, `navigator.storage.persist()` once at startup); `UpdateNotice` ("Update available — Reload") in the header; Settings "Storage" status line; `index.html` manifest/theme-color/icon links; eslint globals for `public/sw.js`.
- Decisions & deviations: `sw.js` precaches the scope root and `index.html`, then cache-first for other same-origin GETs (hashed assets are immutable) and network-first for navigations; all URLs derive from `registration.scope` so T9's subpath works. Theme colour is the hex of `--color-paper`. No new dependencies.
- QA: `npm run verify` green. Preview build in Chromium: worker controls the page, manifest loads, offline reload renders the app with IndexedDB data intact, Settings shows storage status, no page overflow at 1280 px and 700 px, no console errors. Not run: Lighthouse, real-device install.
- Follow-ups: T8 may add a backup reminder using the storage status; bump `CACHE` in `public/sw.js` only if precache contents change.

### T8
- Status / PR / date: Done · 2026-10-19 · branch `claude/leetcode-master-roadmap-znri4s`, merged to `master` at the owner's request
- What shipped: dated export filename (`leetcode-master-backup-YYYY-MM-DD.json`); `lastBackupOn` setting written on export, shown in Settings ("Last backup: N days ago"); side-panel reminder after `BACKUP_REMINDER_DAYS` (14); restore is now two-step (`parseBackupFile` → confirm with "Download current data first" → `restoreBackup`) and ends with a summary ("Restored N attempts across M problems", plus a count of ids not in the catalog); `formatVersion` 3 with informational `catalogVersion`/`appVersion` (1 and 2 still accepted); `src/services/backupHealth.ts` (+ tests) holds the pure rules.
- Decisions & deviations: with no backup on record, the reminder clock starts at the first attempt so new users aren't nagged. `appVersion` comes from `package.json` via a Vite `define` (`__APP_VERSION__`); `tsconfig.node.json` gained `resolveJsonModule` because `@types/node` isn't a dependency. "Problems" in the summary = distinct problems with attempts. Out-of-catalog rows were already kept by `bulkPut`; now they are reported too. The pre-restore download also counts as a backup (`lastBackupOn`).
- QA: `npm run verify` green (262 tests). Preview build in Chromium: v2 file restores, orphan progress row reported and kept, export filename and v3 fields correct, "Last backup" moves never → today, reminder shows in the side panel for a 20-day-old attempt, invalid file shows inline error with Retry, no page overflow at 1280 px and 700 px, no console errors.
- Follow-ups: restoring an old backup brings back its older `lastBackupOn`, so the reminder may reappear; acceptable for now.

### T9
- Status / PR / date: Done, 2026-10-19
- Live URL: https://avrhambi.github.io/leetcode-master/ (expected; goes live after the owner enables Pages and the first deploy runs. Not yet checked on the live host.)
- Decisions & deviations: `deploy.yml` runs `npm ci && npm run verify` then the official upload-pages-artifact / deploy-pages actions, on push to `master` plus manual dispatch. `ci.yml` stays manual-only. QA was done locally against `dist/` served under `/leetcode-master/`: service worker scope, manifest and all three icons resolve, offline reload works, no 4xx, page doesn't scroll. No config change was needed: the relative `base` already works under a subpath.
- Follow-ups: Owner must set repo Settings → Pages → Source: GitHub Actions, then confirm install + offline on the live URL. T10 should link it.

### T10
- Status / PR / date: Done, 2026-10-19 (merged straight to `master`, no PR, at the owner's request)
- What shipped: name applied to header, `<title>`, `package.json`/lockfile, backup error text (and its tests), Settings copy and `CLAUDE.md`; comment on the `pattern-pilot` Dexie name. New README (loop, 75/150/250, cadences, Mermaid architecture, screenshot at `docs/screenshot.png`, live demo, install, privacy, disclaimer, badges), `CONTRIBUTING.md`, `LICENSE`, issue templates (bug, catalog fix) and PR template.
- Decisions & deviations: owner chose **MIT** (so the README does not call the project source-available; the "not for commercial use" note in Decisions is superseded). LICENSE copyright holder is the GitHub handle `Avrhambi`; change it if a legal name is preferred. The CI badge points at `ci.yml`, which is manual-only, so it shows no status until CI is re-enabled; a Deploy badge is included too.
- Follow-ups: owner confirms the copyright holder name and that the live URL is up.

### T12
- Status / PR / date: Done, 2026-10-19
- What shipped:
  - **Time estimate.** The plan shows "About N min" (and how much is left once something is logged), and each item shows ~minutes. The defaults are in `constants.ts` (new 20/35/50, review 10/20/30 for easy/medium/hard). After 3+ logged durations for a (new/review, difficulty) pair, the estimate switches to the median of the user's last 10. Only attempts before today count, so the estimate doesn't change mid-day.
  - **Time budget.** "Time today: Any / 30 / 45 / 60 min", stored as the `sessionMinutes` setting. A fresh plan is trimmed in priority order: the first new problem, the top review, the warm-up, then the remaining items. Leftover minutes pull in more due reviews, still capped at four items. The first item is always kept, so a plan is never empty; it can be a single problem over budget, and the plan says so. Same-day top-ups stop at the budget. Stored items, including "One more problem", are never dropped. Changing the budget stamps `planResetAt`, and the rest of the day is re-planned around what was already logged.
  - **Overload message** now says how many more reviews to clear before new problems come back.
  - **"Your note"** (the latest non-empty attempt note) is shown on review items in the plan and above the attempt form.
- Measured (`dailyPlanSimulation.test.ts`, typical learner, one year, default minutes): no budget, ~4 items a day and 173 problems touched. 30 min: backlog max 20 / 15 / 16 (daily / 4 days / 2 days a week), 75 / 50 / 34 problems solved. 45 min: backlog max 19 / 22 / 15, 84 / 51 / 39 solved. Everything stays under the year-long bound of 30. Every non-overload day keeps a new problem.
- Decisions & deviations:
  - New problem before the top review: the review-first order solved only 44 problems a year at 30 min (backlog max 9). New-first keeps the "one new unless overloaded" rule and nearly doubles throughput, while the overload rule still bounds the backlog.
  - Re-planning uses a reset timestamp, not deleting today's rows. The deleting version raced in the browser: a render still holding the old plan wrote it back after the delete.
  - The budget, events and reset time are read in one live query.
  - No schema change. Two new setting keys were added to `settingKeys`. `formatVersion` stays 3; an older app would reject a backup that contains them.
- QA: Chromium, dev build, 1280 and 390 px. Plan shows ~65 min and 4 items; picking 30 min re-plans it to 1 item with the over-budget note; "Any" restores 4. Notes render on review items. No page scroll at either width.
- Follow-ups: T13–T16 above; the parking-lot lines.

### T13
- Status / PR / date: Done / pushed to `master` at the owner's request / 2026-10-20
- What shipped: an optional `lightReview?: boolean` on `Attempt` (no Dexie version: it is not indexed; backup validation accepts it and old backups without it still restore). `reviews.ts` gains `lightReviewEligible` (a due review at stage 3 or 4; `LIGHT_REVIEW_MIN_STAGE` in `constants.ts`). `AttemptForm` shows "I recalled the approach (about 5 min)" for an eligible problem; it saves a `solved_independently` / `manageable` / `strong` attempt flagged `lightReview`, so stages, XP and badges replay exactly like a full solve and `replayXp` is unchanged. A failed recall logs nothing: the user re-solves and records a normal attempt. History shows "recalled the approach". `sessionTime.ts` skips light attempts when calibrating minutes, so a 5-minute recall doesn't shrink the full-solve estimate.
- Gate (`dailyPlanSimulation.test.ts`, "T13 light review gate"): a recall-decay model (recall chance 55/65/75/82/88% by stage, the same fixed rolls in both runs), 52 weeks, `nc250`. Progress is identical to the baseline (backlog max 21 / 20 / 18, mastered 81 / 48 / 27, same attempts per mastered problem at daily / 4 days / 2 days a week), and minutes drop 7% / 9% / 5% (26,520→24,645; 14,340→13,120; 7,510→7,105 at 5 min per light review).
- Decisions & deviations: a first version capped a recall at stage 4 so only a full solve could master a problem, and offered it at stage 3 only. The same simulation showed that made things worse (mastered 81→72, backlog 21→23 daily; 48→39 and 20→29 at four days a week) and saved only ~3% of minutes, so the cap was dropped. The roadmap's fallback of stage ≥ 3 is what shipped. The model assumes a recall predicts a re-solve equally well, so it can't show whether real recall is weaker; that is untested. Light reviews earn full XP; no separate XP rule.
- QA: production build in Chromium at 390 px. Seeded a due stage-3 problem; the button appeared, saved a flagged attempt, moved the problem to stage 4 with the next review in 30 days, and the button then disappeared. The page didn't scroll. Not checked at other widths, Safari or Firefox.
- Follow-ups: T17 (timer) and T18 (quick log) could offer the light review inline on the plan; the form button is the only entry point today.

### T14
- Status / PR / date: Done / pushed to `master` at the owner's request / 2026-10-20
- What shipped: `services/forecast.ts` (pure, `today` passed in): pace = problems first attempted in the last 28 days ÷ calendar weeks (Monday start) in that window with any attempt; weeks left = ceil(problems in the set with no attempt ÷ pace). The workbench stats show "At this pace you finish the NeetCode 150 in about N weeks.", with the arithmetic in the hover title, and "You have attempted every problem in the …" once the set is done. Weekly goal: optional `weeklyGoalDays` setting (1–7, Settings → "Weekly goal", Off by default), shown as "2 / 4 days this week" beside the weekly streak, with "goal met" once reached. `streak.ts` gained `activeDaysThisWeek` and `parseWeeklyGoal`; `weeklyStreakEndingOn` now shares the same week-counting helper, so there is still one weekly definition and the streak's 3-day threshold is unchanged. `weeklyGoalDays` was added to the backup's accepted setting keys (`formatVersion` stays 3; an older app rejects a backup containing it, as with T12's keys). No Dexie version.
- Decisions & deviations: below 5 new problems in the window no forecast is shown at all (no placeholder), so a brand-new user sees nothing until there is a pace to project. The forecast counts weeks you practise, so skipped weeks add to it; the hover says so. The goal is display-only: it does not change the plan, XP or the weekly streak. Switching sets changes the forecast immediately (remaining is counted per set; pace counts all first attempts). At the owner's request the CLAUDE.md "atomic PRs, never commit direct to master" line was removed.
- QA: `npm run verify` green (311 tests). Production build in Chromium at 1280 and 390 px with 12 seeded new problems over three weeks: forecast reads "about 36 weeks" (144 left ÷ 4 a week) and is hidden with no history; the goal buttons in Settings give "2 / 3 days this week", and Off removes it; no page overflow, no console errors. Not checked in Safari or Firefox.
- Follow-ups: T16 can read `weeklyGoalDays` and the pace for its interview-deadline fit; T21 prefills its day count from the goal.

### T20
- Status / PR / date: Done, 2026-10-20
- What shipped: "Mark problems you already know" (`components/ImportKnown.tsx`, in the shared `Overlay`): a checklist of the active set by topic, a "select whole topic" box per topic (indeterminate when partly ticked), problems that already have a progress row shown ticked and disabled ("already tracked"), and a sticky "Mark N as known" bar. Reachable from Settings ("Import prior history" card; Settings closes and the import opens, because two stacked `Overlay`s would both close on Esc) and offered on first launch: the problem-set banner shows a "Mark problems you already know" button for anyone with no progress and no attempts, so it stays after the set is picked, until the first mark or attempt. Pure `services/importKnown.ts` (+ tests): `spreadReviewDates` puts the marks in catalog order and deals them evenly over 7-21 days from today (`IMPORT_MIN_DAYS` / `IMPORT_MAX_DAYS` / `IMPORT_REVIEW_STAGE` in `constants.ts`), so no day holds more than one mark above any other, 15 or fewer marks land on different days, and the result does not depend on tick order; `importedProgressRows` builds `solved`, stage-2 rows (`lastAttemptDate` and `lastQuality` null) and skips any problem that already has a progress row; `removableImportIds` = progress rows with no attempt. `db/importKnown.ts` (direct Dexie): `importKnownProblems` re-reads existing rows and `bulkAdd`s inside one transaction; `removeImportedMarks` deletes the attempt-less progress rows in one transaction. No `Attempt` rows, so XP, streak and badges are not touched by the import and XP stays `replayXp(attempts)`. "Remove imported marks (N)" asks once inline, then deletes; a failed save or undo shows one inline Retry.
- Decisions & deviations: **No schema change, no new setting, no backup change.** Imported rows already pass backup validation (`lastAttemptDate`/`lastQuality` are nullable), so export and restore keep them; `formatVersion` stays 3. **Undo is "progress with no attempts"**, as the roadmap says, so it would also remove an attempt-less row that came from somewhere else (none exists today); a marked problem that the user has since attempted keeps its row. The first real attempt on an imported row takes over like any other progress row (a strong attempt moves stage 2 to 3). **Dates are spread evenly over the whole window**, not randomised: 13 marks use 13 different days between day 7 and day 21. The picker lists only the active set; switching sets shows another list.
- Known gaps: (1) `skill.ts` replays only attempts, so an imported topic still starts new problems at Easy until the first real attempts there (T16's "skip Easies" is the planned answer). (2) Milestone badges read progress, not attempts, so no badge is awarded by the import itself, but the next real attempt can award one that the imported rows now satisfy (badges are only ever added, and give no XP). (3) The T14 finish forecast counts imported problems as remaining (parking lot). (4) Past ~180 marks the window holds 12+ reviews on a day and the plan pauses new problems for those days (parking lot).
- QA: `npm run verify` green (325 tests). Production build served with `vite preview`, Chromium via Playwright, 1280 and 390 px, 58 checks, all passing: first-launch banner shows the picker and the offer, and the offer is hidden once there is history; Settings button opens the import screen; "select whole topic" selects every untracked problem, a partly ticked topic is indeterminate; importing Arrays & Hashing and Two Pointers (13 problems) wrote 13 progress rows (solved, stage 2, no attempt fields), 0 new attempts, XP unchanged (137 seeded), badges unchanged, a pre-existing progress row byte-identical, dates 7 to 21 days out on 13 distinct days, none due today; the page does not scroll in the banner, the import screen (the checklist scrolls inside the modal body), after import and after undo; undo removed the 12 attempt-less rows and kept the two problems that had attempts; export contains the imported rows and restoring that file brought them back exactly; an injected IndexedDB write failure showed one alert with a single Retry, nothing was written, and Retry saved. Unit tests cover the spread bounds and evenness, order independence, month/year/leap rollovers, skipping existing rows, undo selection, and a 40-mark import coming due over day 7 to 21 (never more than 3 on one day). Not checked: Safari or Firefox; a due-review count on a real later day (the plan was only exercised in the unit test through `dueReviewQueue`).
- Follow-ups: the two parking-lot lines above.
