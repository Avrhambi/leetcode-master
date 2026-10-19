# Contributing to LeetCode Master

Thanks for helping. Read [`CLAUDE.md`](CLAUDE.md) first: it lists the
architecture invariants (pure rules in `src/services/`, direct Dexie calls in
`src/db/`, append-only migrations, a page that never scrolls).

## Setup

```bash
npm install          # Node.js 22.12+
npm run dev          # dev server on the first free port from 8080
npm run verify       # lint -> typecheck -> tests -> build
```

`npm run verify` must pass before every commit. UI changes also need a look in a
browser, including the 720 px breakpoint and "the page never scrolls".

## Commits and pull requests

- Branch off `master`; never commit directly to it.
- One workstream per PR, one logical change per commit.
- Commit messages: `<module>: <what and why>`, e.g.
  `dailyPlan: pause new problems at 12+ due reviews`.
- Do not add a dependency without opening an issue first.

## Proposing a catalog change

The catalog is `src/data/neetcode250.json`: titles, slugs, difficulty, topics and
list flags (`nc75` / `nc150` / `nc250`) plus links. **Never add problem text.**

1. Edit the JSON. Keep `nc75` inside `nc150` inside `nc250`.
2. Do not change an existing `slug`: it is the stored problem id.
3. `npm test -- --run src/data/catalog.test.ts` must pass.

## Proposing a topic-graph edge or a threshold change

Prerequisite edges live in `src/services/topicGraph.ts`; every threshold and
curve lives in `src/services/constants.ts`.

- Rules must stay deterministic: no wall-clock reads, dates passed in as
  `YYYY-MM-DD` strings.
- Back the change with a test. Plan-shape changes need a case in
  `src/services/dailyPlanSimulation.test.ts`; explain what the simulation
  measured before and after.
- XP rules must remain a function of the attempt rows so a replay can only
  raise XP.

## Data model changes

Dexie migrations are append-only new versions. Explain the migration's impact in
the PR. Never rename the `pattern-pilot` database.
