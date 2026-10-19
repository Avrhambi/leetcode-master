import { useEffect, useRef, useState } from 'react';
import type { GamificationSnapshot } from '../services/gamification';
import { xpConsistencyMultiplier } from '../services/constants';

interface GamificationBarProps {
  snapshot: GamificationSnapshot;
  // Grace-free consecutive-active-day count ending today — the same number that
  // drives the XP multiplier on the award path. 0 when the user is not on a
  // streak today.
  streakDays: number;
  // Consecutive calendar weeks with 3+ active days. The XP multiplier is the
  // better of the daily and weekly tiers, so a steady 3-days-a-week user earns it.
  streakWeeks: number;
}

// Minimal XP / level strip. The fill width transitions on XP change. When the
// level rises while this component is mounted, a one-shot pulse plays; a level-up
// that happened while the user was on another screen is not replayed (nothing
// stores what was last announced — an accepted limitation).
export function GamificationBar({ snapshot, streakDays, streakWeeks }: GamificationBarProps) {
  const { level, xp, xpIntoLevel, xpForNextLevel } = snapshot;
  const pct = xpForNextLevel > 0 ? Math.round((xpIntoLevel / xpForNextLevel) * 100) : 100;
  const multiplier = xpConsistencyMultiplier(streakDays, streakWeeks);

  const previousLevel = useRef(level);
  const [leveled, setLeveled] = useState(false);

  useEffect(() => {
    const rose = level > previousLevel.current;
    previousLevel.current = level;
    if (!rose) return;
    setLeveled(true);
    // Clear the flag after the pulse, and also on cleanup, so a second level-up
    // landing mid-pulse still re-fires it.
    const timer = window.setTimeout(() => setLeveled(false), 1000);
    return () => {
      window.clearTimeout(timer);
      setLeveled(false);
    };
  }, [level]);

  return <article className="xp-bar" data-leveled={leveled} aria-label={`Level ${level}, ${xp} total XP`}>
    <div className="xp-bar-topline">
      <span className="xp-bar-lead">
        <strong>Lv {level}</strong>
        {multiplier > 1 && (
          <span className="xp-multiplier" title={`${streakDays}-day streak, ${streakWeeks} consistent ${streakWeeks === 1 ? 'week' : 'weeks'} — attempts earn ${multiplier}× XP today`}>
            ×{multiplier} XP
          </span>
        )}
      </span>
      <span>{xpIntoLevel} / {xpForNextLevel} XP to level {level + 1}</span>
    </div>
    <div className="xp-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="xp-fill" style={{ width: `${pct}%` }} />
    </div>
  </article>;
}
