import type { TopicMasteryCell } from '../services/mastery';
import { TIER_LABELS, topicTier, type TopicTier } from '../data/topicTiers';
import { layoutPath, trackPath, VIEW_H, VIEW_W, type PathNode } from '../services/topicPath';

interface TopicMapProps {
  cells: TopicMasteryCell[];
  strugglingTopics: Set<string>;
  selectedTopic: string | null;
  onSelectTopic: (topic: string) => void;
}

// The topic map as a quest path: one winding trail through all 18 topics in
// curriculum order, each topic a node whose ring fills with mastery.
//
// It is an SVG on a fixed viewBox, which is what lets the placement be
// irregular. Earlier grid layouts kept perfect alignment and so always read as
// a table however much the tile sizes varied; here a node's position is a point
// on a spline, and the trail is the thing the eye follows. The viewBox also
// makes the map overflow-proof by construction — it scales into whatever box
// the map region gets and can never push the page into a scroll.
//
// Placement is a deterministic function of catalog index (services/topicPath.ts),
// so the curriculum ordering the user likes is preserved exactly.

const NODE_R = 3.4;

// Mastery rung, 0–4 — the fill token and the node's size step.
function masteryBand(mastery: number): 0 | 1 | 2 | 3 | 4 {
  if (mastery >= 0.85) return 4;
  if (mastery >= 0.6) return 3;
  if (mastery >= 0.35) return 2;
  if (mastery > 0) return 1;
  return 0;
}

function Node({ node, cell, struggling, selected, onSelect }: {
  node: PathNode;
  cell: TopicMasteryCell;
  struggling: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const band = masteryBand(cell.mastery);
  const pct = Math.round(cell.mastery * 100);
  // Mastery is carried by three channels so no single one is load-bearing:
  // the ring's fill arc, the core's colour rung, and the node's radius.
  const radius = NODE_R + band * 0.45;
  const circumference = 2 * Math.PI * (radius + 1.4);
  // The star means "topic proficient": every core problem of the active set at review stage 3+.
  const complete = cell.proficient;

  const classes = ['path-node', struggling ? 'struggling' : '', selected ? 'selected' : '', complete ? 'complete' : '']
    .filter(Boolean).join(' ');

  return <g
    className={classes}
    data-band={band}
    role="button"
    tabIndex={0}
    aria-pressed={selected}
    aria-label={`${cell.topic}: ${pct}% mastery, ${cell.attempted} of ${cell.total} attempted${cell.proficient ? ', proficient' : ''}${struggling ? ', needs a different approach' : ''}`}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    }}
  >
    {/* Hit area — comfortably larger than the drawn node. */}
    <circle className="path-node-hit" cx={node.x} cy={node.y} r={radius + 4} />
    <circle className="path-node-track" cx={node.x} cy={node.y} r={radius + 1.4} />
    {/* The progress ring: stroke-dasharray draws the mastered fraction, rotated
        to start at 12 o'clock. */}
    <circle
      className="path-node-ring"
      cx={node.x}
      cy={node.y}
      r={radius + 1.4}
      strokeDasharray={`${(circumference * cell.mastery).toFixed(2)} ${circumference.toFixed(2)}`}
      transform={`rotate(-90 ${node.x} ${node.y})`}
    />
    <circle className="path-node-core" cx={node.x} cy={node.y} r={radius} />
    {complete && <text className="path-node-check" x={node.x} y={node.y} dy="0.09em" textAnchor="middle">★</text>}
    <text
      className="path-node-label"
      x={node.x + node.labelDx}
      y={node.labelBelow ? node.y + radius + 4.4 : node.y - radius - 2.4}
      textAnchor={node.anchor}
    >{cell.topic}</text>
  </g>;
}

export function TopicMap({ cells, strugglingTopics, selectedTopic, onSelectTopic }: TopicMapProps) {
  if (cells.length === 0) return null;

  // Walk the topics tier by tier, keeping catalog order inside each tier — the
  // same ordering the previous bands used, now expressed as one continuous route.
  const ordered: { topic: string; tier: TopicTier }[] = [];
  for (const tier of [1, 2, 3] as TopicTier[]) {
    for (const cell of cells) if (topicTier(cell.topic) === tier) ordered.push({ topic: cell.topic, tier });
  }

  const nodes = layoutPath(ordered);
  const cellByTopic = new Map(cells.map((cell) => [cell.topic, cell]));
  const track = trackPath(nodes);

  // The lit portion of the trail: how far along the *route* the user has come,
  // not their average mastery. The trail lights up to the last node they have
  // touched, so the glow tracks the journey rather than sliding back when a new
  // topic drags the mean down.
  const lastTouched = nodes.reduce(
    (furthest, node) => ((cellByTopic.get(node.topic)?.attempted ?? 0) > 0 ? node.index : furthest),
    -1
  );
  const progress = nodes.length < 2 ? 0 : Math.max(0, lastTouched) / (nodes.length - 1);
  const clearedTopics = cells.filter((cell) => cell.proficient).length;

  return <section className="topic-map" aria-labelledby="topic-map-heading">
    <div className="topic-map-head">
      <p className="eyebrow" id="topic-map-heading">The route</p>
      <p className="topic-map-hint">
        <b>{clearedTopics}</b> of <b>{cells.length}</b> topics proficient · follow the trail, pick a stop to see its problems
      </p>
    </div>
    <div className="topic-map-canvas">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="topic-path"
        role="group"
        aria-label="Topic route"
      >
        {/* The trail: a dim full route with the travelled portion lit over it. */}
        <path className="topic-track" d={track} pathLength={1} />
        <path
          className="topic-track-lit"
          d={track}
          pathLength={1}
          strokeDasharray={`${progress.toFixed(3)} 1`}
        />
        {/* Tier gates — where the curriculum steps up. */}
        {nodes.filter((node) => node.tierStart).map((node) => {
          // Opposite the node's own label. Clamp the y so a gate on a low leg
          // cannot slip past the viewBox bottom edge, and share the node's
          // horizontal anchor so an edge-node gate does not overflow either.
          const gateY = node.labelBelow ? node.y - 8.5 : Math.min(node.y + 10.5, VIEW_H - 2.5);
          return (
            <text
              key={`gate-${node.tier}`}
              className="tier-gate"
              x={node.x + node.labelDx}
              y={gateY}
              textAnchor={node.anchor}
            >
              {TIER_LABELS[node.tier]}
            </text>
          );
        })}
        {nodes.map((node) => {
          const cell = cellByTopic.get(node.topic);
          if (!cell) return null;
          return <Node
            key={node.topic}
            node={node}
            cell={cell}
            struggling={strugglingTopics.has(node.topic)}
            selected={node.topic === selectedTopic}
            onSelect={() => onSelectTopic(node.topic)}
          />;
        })}
      </svg>
    </div>
  </section>;
}
