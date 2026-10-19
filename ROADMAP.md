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
| T0 | CI + dependency hygiene | — | T1, T7 | Todo |
| T1 | Catalog → NeetCode 250 with NeetCode 75 / 150 flags and neetcode.io links | — | T0, T7 | Todo |
| T2 | Problem-set selector (75 / 150 / 250) | T1 | T3 | Todo |
| T3 | Competency engine: topic skill + prerequisite graph | T1 | T2 | Todo |
| T4 | Cadence-aware plan: regular, occasional and returning users | T3 | T7, T8 | Todo |
| T11 | Review load: reach mastery with fewer repeats | T4 | T7, T8 | Todo |
| T5 | Competency engine: reinforcement problems on repeated failure | T11 | T7, T8 | Todo |
| T6 | Gamification aligned to the app's goals and to every practice cadence | T2, T4, T11 | T7, T8 | Todo |
| T7 | PWA: installable, offline, persistent storage | — | anything | Todo |
| T8 | Backup hardening | T2 | T4, T5, T6, T7 | Todo |
| T9 | Live demo on GitHub Pages | T0, T7 | T4, T5, T6, T8 | Todo |
| T10 | Open-source packaging: README, CONTRIBUTING, license, name | T1–T9 | — | Todo |

Suggested order: **T0 → T1 → (T2 ∥ T3) → T4 → T11 → T5 → T6**, with **T7**, **T8**
and **T9** slotted in whenever a session is free. **T10** goes last. T3, T4, T11
and T5 all change how the plan behaves, so they run one after another, never in
parallel. (T11 was added after the first numbering, which is why it sits between
T4 and T5 in the order.)

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
| Every persona gets ≥ 1 new problem per active day, and the plan never exceeds 4 items. | T4 |
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
| `src/services/reviews.ts` stage and interval rules | T11 |
| XP formula, streak multiplier, badges, map "cleared" star, `gamification*.ts`, Dexie v5 | T6 |
| `public/`, manifest, service worker, `navigator.storage.persist()` | T7 |
| `src/db/backup.ts` (beyond adding a settings key, see below) | T8 |
| `.github/workflows/ci.yml`, `package.json` versions | T0 |
| `.github/workflows/deploy.yml` | T9 |
| `README.md`, `CONTRIBUTING.md`, `LICENSE`, app name in UI/package/manifest | T10 |

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
  - Every persona gets at least one new problem on every active day.
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

### T11
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
- What shipped:
- Decisions & deviations:
- Follow-ups:

### T9
- Status / PR / date:
- Live URL:
- Decisions & deviations:
- Follow-ups:

### T10
- Status / PR / date:
- What shipped:
- Decisions & deviations:
- Follow-ups:
