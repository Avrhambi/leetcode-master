import { useEffect, useRef, useState, type ReactElement } from 'react';
import { BADGES, type BadgeId } from '../services/constants';
import { badgeHint } from '../services/badges';
import type { ProblemList } from '../types/models';

interface BadgeShelfProps {
  earned: string[];
  // The active set, so volume and proficiency hints quote its numbers.
  problemSet: ProblemList;
  setSize: number;
}

// One geometry mark per badge, filled when earned, outline when locked. Typed by
// BadgeId so a new badge in `constants.ts` without a mark here is a compile
// error, not a silently blank <svg>. Each axis has its OWN glyph family and the
// tier within it adds one element — so no two marks collide, and the strip reads
// as a set of progressions:
//   retention   — horizontal bars stacking up (1 → 2 → 3)
//   consistency — a bar chart gaining bars (1 → 2 → 3 → 4); weekly: a grid of
//                 squares (2×2 → 3×3 → 4×4); welcome back: a return arrow
//   mastery     — a diamond gaining a ring, then a second diamond; comeback: an
//                 up arrow; foundations: a stepped pyramid
//   volume      — triangle, a half disc, then a full disc; lists: 1 → 2 → 3 hexagons
//   level       — a chevron, then a double chevron
// All shapes are filled solid (see gamification.css), so families are told apart
// by silhouette, not by fine detail that vanishes at 20px.
// Badges earned while this is mounted get a one-shot reveal fade.
const bars = (n: number) => Array.from({ length: n }, (_, i) => (
  <rect key={i} x={12 + i * 22} y={70 - i * 16} width="14" height={20 + i * 16} />
));
// n horizontal bars filling the mark's height.
const rows = (n: number) => Array.from({ length: n }, (_, i) => {
  const height = 80 / n - 8;
  return <rect key={i} x="12" y={10 + i * (80 / n) + 4} width="76" height={height} />;
});
const grid = (n: number) => {
  const size = 76 / (n * 1.5 - 0.5);
  return Array.from({ length: n * n }, (_, i) => (
    <rect key={i} x={12 + (i % n) * size * 1.5} y={12 + Math.floor(i / n) * size * 1.5} width={size} height={size} />
  ));
};
const hexagon = (cx: number, cy: number, r: number, key: number) => {
  const points = [0, 1, 2, 3, 4, 5].map((i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
  return <polygon key={key} points={points} />;
};
const MARKS: Record<BadgeId, ReactElement> = {
  'first-solve': <polygon points="50,12 88,80 12,80" />,
  'first-mastered': <rect x="16" y="16" width="68" height="68" />,
  // Retention — horizontal bars, one more per tier.
  'retained-10': <>{rows(1)}</>,
  'retained-25': <>{rows(2)}</>,
  'retained-50': <>{rows(3)}</>,
  // Consistency — a bar chart, one more (taller) bar per streak tier.
  'week-streak': <>{bars(1)}</>,
  'ten-day-streak': <>{bars(2)}</>,
  'month-streak': <>{bars(3)}</>,
  'century-streak': <>{bars(4)}</>,
  // Weekly consistency — a calendar grid that fills out.
  'weeks-4': <>{grid(2)}</>,
  'weeks-12': <>{grid(3)}</>,
  'weeks-26': <>{grid(4)}</>,
  'welcome-back': <polygon points="8,50 44,14 44,36 92,36 92,64 44,64 44,86" />,
  // Mastery — one diamond, then two, then three (topics falling).
  'foundations-solid': <><rect x="8" y="64" width="84" height="26" /><rect x="22" y="38" width="56" height="22" /><rect x="36" y="12" width="28" height="22" /></>,
  comeback: <polygon points="50,8 90,50 66,50 66,92 34,92 34,50 10,50" />,
  'topic-cleared': <polygon points="50,10 82,50 50,90 18,50" />,
  'five-topics-cleared': <><polygon points="30,14 54,50 30,86 6,50" /><polygon points="70,14 94,50 70,86 46,50" /></>,
  'all-mastered': <><polygon points="22,20 40,50 22,80 4,50" /><polygon points="50,20 68,50 50,80 32,50" /><polygon points="78,20 96,50 78,80 60,50" /></>,
  // Volume — a half disc, then a full disc; completed lists are hexagons.
  'half-catalog': <path d="M50 8 A42 42 0 0 1 50 92 Z" />,
  century: <circle cx="50" cy="50" r="42" />,
  'list-75': hexagon(50, 50, 42, 0),
  'list-150': <>{hexagon(28, 50, 24, 0)}{hexagon(72, 50, 24, 1)}</>,
  'list-250': <>{hexagon(50, 30, 22, 0)}{hexagon(27, 70, 22, 1)}{hexagon(73, 70, 22, 2)}</>,
  // Level — a chevron, then a double chevron.
  'level-5': <polygon points="50,14 90,54 78,66 50,38 22,66 10,54" />,
  'level-10': <><polygon points="50,10 88,48 78,58 50,30 22,58 12,48" /><polygon points="50,46 88,84 78,94 50,66 22,94 12,84" /></>
};

export function BadgeShelf({ earned, problemSet, setSize }: BadgeShelfProps) {
  const earnedSet = new Set(earned);
  const knownRef = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (knownRef.current === null) { knownRef.current = new Set(earned); return; }
    const added = earned.filter((id) => !knownRef.current!.has(id));
    knownRef.current = new Set(earned);
    if (added.length === 0) return;
    setFresh(new Set(added));
    // Always clear the flag after the reveal window, even if another badge lands
    // mid-animation — otherwise the `fresh` class would stick and a later unlock
    // could not re-fire it.
    const timer = window.setTimeout(() => setFresh(new Set()), 700);
    return () => {
      window.clearTimeout(timer);
      setFresh(new Set());
    };
  }, [earned]);

  // A compact strip of marks — the header slot on a screen that does not scroll
  // has no room for cards, so each badge carries its label and hint in the
  // tooltip and the accessible name instead.
  return <div className="badge-strip-scroll">
    <ul className="badge-strip" aria-label={`Badges, ${earnedSet.size} of ${BADGES.length} earned`}>
      {BADGES.map((badge) => {
        const isEarned = earnedSet.has(badge.id);
        const classes = ['milestone', isEarned ? 'earned' : 'locked', fresh.has(badge.id) ? 'fresh' : ''].filter(Boolean).join(' ');
        const description = isEarned ? `${badge.label} — earned` : `${badge.label} — locked. ${badgeHint(badge.id, problemSet, setSize)}`;
        return <li className={classes} key={badge.id} title={description}>
          <svg className="milestone-mark" viewBox="0 0 100 100" role="img" aria-label={description}>{MARKS[badge.id]}</svg>
        </li>;
      })}
    </ul>
  </div>;
}
