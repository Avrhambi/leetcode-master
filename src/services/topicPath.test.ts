import { describe, expect, it } from 'vitest';
import { layoutPath, PORTRAIT_SHAPE, trackPath, VIEW_H, VIEW_W, WIDE_SHAPE, type PathShape } from './topicPath';
import type { TopicTier } from '../data/topicTiers';

const TOPICS: { topic: string; tier: TopicTier }[] = [
  { topic: 'Arrays & Hashing', tier: 1 },
  { topic: 'Two Pointers', tier: 1 },
  { topic: 'Sliding Window', tier: 1 },
  { topic: 'Stack', tier: 1 },
  { topic: 'Binary Search', tier: 1 },
  { topic: 'Linked List', tier: 1 },
  { topic: 'Trees', tier: 1 },
  { topic: 'Heap / Priority Queue', tier: 2 },
  { topic: 'Backtracking', tier: 2 },
  { topic: 'Graphs', tier: 2 },
  { topic: '1-D Dynamic Programming', tier: 2 },
  { topic: 'Greedy', tier: 2 },
  { topic: 'Intervals', tier: 2 },
  { topic: 'Tries', tier: 3 },
  { topic: 'Advanced Graphs', tier: 3 },
  { topic: '2-D Dynamic Programming', tier: 3 },
  { topic: 'Math & Geometry', tier: 3 },
  { topic: 'Bit Manipulation', tier: 3 }
];

describe('layoutPath', () => {
  it('keeps the given topic order', () => {
    expect(layoutPath(TOPICS).map((node) => node.topic)).toEqual(TOPICS.map((t) => t.topic));
  });

  it('is deterministic — the same input lays out identically', () => {
    expect(layoutPath(TOPICS)).toEqual(layoutPath(TOPICS));
  });

  it('keeps every node inside the viewBox with room for its label', () => {
    for (const node of layoutPath(TOPICS)) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(VIEW_W);
      // Labels sit above or below the node, so both edges need clearance.
      expect(node.y).toBeGreaterThanOrEqual(8);
      expect(node.y).toBeLessThanOrEqual(VIEW_H - 8);
    }
  });

  it('anchors edge-of-leg labels inward so wide topic names cannot clip the viewBox', () => {
    for (const node of layoutPath(TOPICS)) {
      if (node.x < VIEW_W * 0.15) expect(node.anchor).toBe('start');
      else if (node.x > VIEW_W * 0.85) expect(node.anchor).toBe('end');
      // start pushes the label right, end pushes it left, middle no nudge.
      if (node.anchor === 'start') expect(node.labelDx).toBeGreaterThan(0);
      if (node.anchor === 'end') expect(node.labelDx).toBeLessThan(0);
      if (node.anchor === 'middle') expect(node.labelDx).toBe(0);
    }
  });

  it('alternates the label side so neighbours never share a baseline', () => {
    const nodes = layoutPath(TOPICS);
    for (let i = 0; i < nodes.length - 1; i++) {
      // Only within a leg — a leg boundary may repeat a side, and those two
      // nodes are at opposite ends of the canvas anyway.
      const sameLeg = Math.abs(nodes[i + 1].x - nodes[i].x) < VIEW_W / 2;
      if (sameLeg) expect(nodes[i + 1].labelBelow).not.toBe(nodes[i].labelBelow);
    }
  });

  it('marks only the first node of each new tier as a gate', () => {
    const gates = layoutPath(TOPICS).filter((node) => node.tierStart);
    expect(gates.map((node) => node.topic)).toEqual(['Heap / Priority Queue', 'Tries']);
  });

  it('never marks the first node as a gate', () => {
    expect(layoutPath(TOPICS)[0].tierStart).toBe(false);
  });

  it('separates consecutive nodes so they cannot overlap', () => {
    const nodes = layoutPath(TOPICS);
    for (let i = 0; i < nodes.length - 1; i++) {
      const dx = nodes[i + 1].x - nodes[i].x;
      const dy = nodes[i + 1].y - nodes[i].y;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(12);
    }
  });

  it('handles the degenerate sizes', () => {
    expect(layoutPath([])).toEqual([]);
    const one = layoutPath([{ topic: 'Only', tier: 1 }]);
    expect(one).toHaveLength(1);
    expect(Number.isFinite(one[0].x)).toBe(true);
    expect(Number.isFinite(one[0].y)).toBe(true);
  });
});

describe('trackPath', () => {
  it('is empty below two nodes', () => {
    expect(trackPath([])).toBe('');
    expect(trackPath(layoutPath([{ topic: 'Only', tier: 1 }]))).toBe('');
  });

  it('starts at the first node and emits a curve per gap', () => {
    const nodes = layoutPath(TOPICS);
    const d = trackPath(nodes);
    expect(d.startsWith(`M ${nodes[0].x.toFixed(2)} ${nodes[0].y.toFixed(2)}`)).toBe(true);
    expect(d.match(/C /g)).toHaveLength(nodes.length - 1);
    expect(d).not.toMatch(/NaN|Infinity/);
  });
});

describe('layoutPath — portrait (phone) shape', () => {
  const nodes = layoutPath(TOPICS, PORTRAIT_SHAPE);

  it('keeps the order, runs 3 stops per leg, and stays inside its viewBox', () => {
    expect(nodes.map((node) => node.topic)).toEqual(TOPICS.map((t) => t.topic));
    expect(new Set(nodes.map((node) => Math.round(node.y / 10))).size).toBeGreaterThanOrEqual(6);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(PORTRAIT_SHAPE.viewW);
      expect(node.y).toBeGreaterThanOrEqual(8);
      expect(node.y).toBeLessThanOrEqual(PORTRAIT_SHAPE.viewH - 8);
    }
  });

  it('keeps the trail curving: each leg\'s middle stop rises above its edge stops, clear of their labels', () => {
    for (let leg = 0; leg < 6; leg++) {
      const [first, middle] = [nodes[leg * 3], nodes[leg * 3 + 1]];
      expect(middle.y).toBeLessThan(first.y - 2);
      expect(middle.labelBelow).toBe(false);
    }
  });

  it('separates consecutive stops', () => {
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y)).toBeGreaterThan(12);
    }
  });
});

// Label extents, estimated for the monospace body font (0.6em per glyph) at the
// font size the CSS sets for each shape. Two labels on the same side of the same
// leg must not overlap, or the longest topic names collide.
function labelsOverlap(shape: PathShape, fontSize: number): string[] {
  const nodes = layoutPath(TOPICS, shape);
  const extent = (node: (typeof nodes)[number]) => {
    const width = node.topic.length * 0.6 * fontSize;
    const x = node.x + node.labelDx;
    return node.anchor === 'start' ? [x, x + width] : node.anchor === 'end' ? [x - width, x] : [x - width / 2, x + width / 2];
  };
  const clashes: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [a, b] = [nodes[i], nodes[j]];
      const labelY = (node: typeof a) => (node.labelBelow ? node.y + 9 : node.y - 7);
      if (Math.abs(labelY(a) - labelY(b)) > fontSize * 1.2) continue;
      const [a0, a1] = extent(a);
      const [b0, b1] = extent(b);
      if (a0 < b1 && b0 < a1) clashes.push(`${a.topic} / ${b.topic}`);
    }
  }
  return clashes;
}

describe('route labels never collide', () => {
  it('wide shape (2.7px labels)', () => expect(labelsOverlap(WIDE_SHAPE, 2.7)).toEqual([]));
  it('portrait shape (3px labels)', () => expect(labelsOverlap(PORTRAIT_SHAPE, 3)).toEqual([]));
  it('labels stay inside the viewBox', () => {
    for (const [shape, font] of [[WIDE_SHAPE, 2.7], [PORTRAIT_SHAPE, 3]] as const) {
      for (const node of layoutPath(TOPICS, shape)) {
        const width = node.topic.length * 0.6 * font;
        const x = node.x + node.labelDx;
        const [left, right] = node.anchor === 'start' ? [x, x + width] : node.anchor === 'end' ? [x - width, x] : [x - width / 2, x + width / 2];
        expect(left, node.topic).toBeGreaterThanOrEqual(0);
        expect(right, node.topic).toBeLessThanOrEqual(shape.viewW);
      }
    }
  });
});
