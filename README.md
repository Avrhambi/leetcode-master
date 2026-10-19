# leetcode-master

A local-first study coach for the NeetCode 150. It turns "grind LeetCode until
something sticks" into a directed, adaptive practice loop.

## Why this exists

Almost everyone preparing for a software engineering interview ends up on
LeetCode, and most of them work through the NeetCode 150 — the widely-shared
curated list of 150 problems that covers the patterns interviewers actually ask
about. It is the closest thing the field has to a standard syllabus.

The list tells you *what* to solve. It does not tell you *how to practise it*.

## The problem

Working through the 150 on your own is frustrating in a specific way:

- **No direction.** You finish a problem and there is no answer to "what next?"
  You either march down the list in order or pick something at random. Neither
  reflects what you actually need to work on.
- **No steering.** Nothing reacts to how a problem *went*. Solving Two Sum in two
  minutes and barely scraping through a hard DP problem after watching the
  solution both just become a green checkmark. The list can't tell the
  difference, so it can't adjust.
- **No retention.** You "did" a topic three weeks ago and now you'd fail it cold.
  A flat checklist has no notion of review, so knowledge quietly decays while the
  list still shows it as done.
- **Blind spots get worse.** The topic you're weakest at is the one you avoid,
  and nothing pushes back — or, if you force yourself through it, nothing stops
  you from drowning in problems from the one area you're stuck on.

The result is a lot of effort spent without a sense of whether it's the *right*
effort, and no feedback loop to correct course.

## The solution

This wraps the NeetCode 150 in a coaching loop that reacts to your results.

**A daily plan, not a list.** Each day you get two to four problems: at least one
new one, plus reviews that are actually due. New problems are chosen by a
priority score per topic — how foundational the topic is, how far along you are
in it, and how recently you last touched it — so you get breadth early and depth
where you need it, not a fixed march down the list.

**Every attempt steers the next one.** You record how a problem went — solved it
cleanly, needed a hint, watched the solution, couldn't do it — and that outcome
feeds back in. A weak result pulls the topic back up the priority list and
schedules a near-term review; a strong result lets the topic fade and pushes the
next review further out.

**Spaced repetition for retention.** Solved problems come back on an expanding
schedule (3 days → 1 week → 2 weeks → 1 month → mastered), so a topic you learned
three weeks ago resurfaces before you've lost it, not after.

**Blind-spot handling.** After a few failed attempts a problem is flagged as
*struggling*: its reviews back off to a 2/4/7-day ladder instead of hitting you
daily, and its topic stops flooding your plan with new problems from the area
you're stuck on — while still not unlocking that topic's *harder* problems until
you've genuinely made progress.

**Progress you can see.** The whole app is one screen that never scrolls. Its
centrepiece is a quest path — a winding trail through all 18 topics, lit behind
you and dim ahead, where each stop's ring fills as you master it and a cleared
topic earns a star. Alongside it: XP and levels for every attempt, milestone
badges, and a streak with a grace day for the day you miss. A topic you're stuck
on is marked in red, off the mastery scale entirely, so "needs a different
approach" can never be mistaken for progress.

Everything runs in the browser. Your data lives in IndexedDB — no account, no
server, no network calls — and you can export or import it as a single JSON file.

## Running it

```bash
npm install
npm run dev      # dev server on the first free port from 8080
npm run verify   # lint, typecheck, tests, production build
```

Requires Node.js 22.12+. Stack: React 19 + TypeScript + Vite, Dexie/IndexedDB,
plain CSS. The NeetCode 250 catalog (with the 75 and 150 lists flagged inside it) is bundled — first launch seeds it and you're
ready to go.

See [`CLAUDE.md`](CLAUDE.md) for the architecture notes, invariants, and
conventions.

