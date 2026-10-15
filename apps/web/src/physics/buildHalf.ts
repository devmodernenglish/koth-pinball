import Matter from 'matter-js';
import type { FlipperSide, SlotIndex } from '@koth/shared';
import {
  BUMPER,
  CENTER_X,
  COLLISION,
  CORNER_ARC,
  DIVIDER,
  FLIPPER,
  LANE,
  OUTER_WALL_THICKNESS,
  PLAYFIELD,
  TABLE_HEIGHT,
  WALL_THICKNESS,
} from './constants';
import {
  arcPoints,
  box,
  mirrorPoint,
  mirrorX,
  polygon,
  segment,
  sensor,
  type HalfSide,
  type Point,
} from './geometry';

export interface FlipperDef {
  side: FlipperSide;
  body: Matter.Body;
  constraint: Matter.Constraint;
  pivot: Point;
  /** +1 when the flipper extends rightwards from its pivot, −1 when it extends leftwards. */
  dir: 1 | -1;
  /** Distance from the pivot to the body's centre along its long axis. */
  offset: number;
  restAngle: number;
  upAngle: number;
}

export interface SlingDef {
  body: Matter.Body;
  normal: Matter.Vector;
}

export interface HalfDefinition {
  side: HalfSide;
  slot: SlotIndex;
  walls: Matter.Body[];
  bumpers: Matter.Body[];
  slings: SlingDef[];
  flippers: Record<FlipperSide, FlipperDef>;
  drain: Matter.Body;
  laneGate: Matter.Body;
  /** Region of the plunger lane where the plunger can strike the ball. */
  laneZone: Matter.Bounds;
  /** The whole lane, used to decide when the one-way gate may open. */
  laneColumn: Matter.Bounds;
  laneSpawn: Point;
  /** Sensor region covering this half; hazards affect the ball only inside it (FR-C8). */
  hazardZone: Matter.Body;
  /** Stalemate kicker near the centre wall, pushing the ball towards the other half (FR-C9). */
  kickerZone: Matter.Body;
  kickDir: 1 | -1;
  extraBumperSpots: Point[];
}

const HALF_CENTRE_X = (FLIPPER.outerPivotX + FLIPPER.innerPivotX) / 2;
const DIVIDER_FACE_X = CENTER_X - DIVIDER.thickness / 2;
const LANE_WALL_FACE_X = LANE.wallX + WALL_THICKNESS / 2;

/** Mirrors an x inside the half around the half's own centre (outer ↔ inner). */
const swapInner = (x: number): number => 2 * HALF_CENTRE_X - x;

function bounds(side: HalfSide, x1: number, x2: number, y1: number, y2: number): Matter.Bounds {
  const a = mirrorX(side, x1);
  const b = mirrorX(side, x2);
  return { min: { x: Math.min(a, b), y: y1 }, max: { x: Math.max(a, b), y: y2 } };
}

function makeBumper(p: Point): Matter.Body {
  return Matter.Bodies.circle(p.x, p.y, BUMPER.radius, {
    isStatic: true,
    label: 'bumper',
    restitution: 0.6,
    collisionFilter: { category: COLLISION.wall, mask: COLLISION.ball },
  });
}

export { makeBumper };

function makeFlipper(slot: SlotIndex, side: FlipperSide, pivot: Point): FlipperDef {
  const dir: 1 | -1 = side === 'left' ? 1 : -1;
  const restAngle = dir * FLIPPER.restAngle;
  const upAngle = dir * FLIPPER.upAngle;
  const tail = 12; // the body extends a little behind the pivot so the hinge is covered
  const length = FLIPPER.length + tail;
  const offset = (FLIPPER.length - tail) / 2;
  const centre = {
    x: pivot.x + dir * offset * Math.cos(restAngle),
    y: pivot.y + dir * offset * Math.sin(restAngle),
  };
  const body = Matter.Bodies.rectangle(centre.x, centre.y, length, FLIPPER.thickness, {
    label: `flipper`,
    angle: restAngle,
    density: FLIPPER.density,
    friction: 0.05,
    restitution: 0,
    chamfer: { radius: FLIPPER.thickness / 2 - 1 },
    collisionFilter: { category: COLLISION.flipper, mask: COLLISION.ball },
  });
  // FR-C3: pinned to the table with a hinge constraint at the pivot.
  const constraint = Matter.Constraint.create({
    pointA: { ...pivot },
    bodyB: body,
    pointB: { x: pivot.x - centre.x, y: pivot.y - centre.y },
    length: 0,
    stiffness: 1,
    label: `hinge:${slot}:${side}`,
  });
  return { side, body, constraint, pivot, dir, offset, restAngle, upAngle };
}

/** Builds one half of the table. Geometry is authored for the left half and mirrored for the right (FR-C2). */
export function buildHalf(side: HalfSide): HalfDefinition {
  const slot: SlotIndex = side === 'left' ? 0 : 1;
  const P = (x: number, y: number): Point => mirrorPoint(side, { x, y });
  const walls: Matter.Body[] = [];

  // Outer wall.
  walls.push(box(mirrorX(side, PLAYFIELD.outerX - OUTER_WALL_THICKNESS / 2), TABLE_HEIGHT / 2, OUTER_WALL_THICKNESS, TABLE_HEIGHT + 200));

  // Plunger lane: inner wall and floor.
  walls.push(segment(P(LANE.wallX, LANE.wallTop), P(LANE.wallX, TABLE_HEIGHT + 20), 'laneWall'));
  walls.push(box(mirrorX(side, (PLAYFIELD.outerX + LANE.innerX) / 2), LANE.floorY + 30, LANE.innerX + 10, 60, 'laneFloor'));

  // Curved top corner that turns a launched ball into the playfield.
  const r = CORNER_ARC.radius + WALL_THICKNESS / 2;
  const arc = arcPoints(CORNER_ARC.cx, CORNER_ARC.cy, r, Math.PI, Math.PI * 1.5, CORNER_ARC.segments);
  for (let i = 0; i < arc.length - 1; i++) {
    const a = arc[i];
    const b = arc[i + 1];
    if (a && b) walls.push(segment(P(a.x, a.y), P(b.x, b.y), 'arc'));
  }

  // One-way gate over the lane exit: open while the ball leaves, solid when it comes back.
  const laneGate = segment(P(PLAYFIELD.outerX + 2, 142), P(LANE.wallX, LANE.wallTop + 2), 'laneGate', 8);

  // Inlane funnels and aprons that guide the ball onto the flippers.
  const outerFunnelTop = P(LANE_WALL_FACE_X, 588);
  const outerFunnelEnd = P(FLIPPER.outerPivotX - 10, 670);
  const innerFunnelTop = P(DIVIDER_FACE_X, 588);
  const innerFunnelEnd = P(FLIPPER.innerPivotX + 10, 670);
  walls.push(segment(outerFunnelTop, outerFunnelEnd, 'funnel'));
  walls.push(segment(innerFunnelTop, innerFunnelEnd, 'funnel'));
  const apron = (top: Point, end: Point, edgeX: number): Matter.Body => {
    const pts = [top, end, { x: end.x, y: TABLE_HEIGHT + 10 }, { x: mirrorX(side, edgeX), y: TABLE_HEIGHT + 10 }];
    return polygon(pts, 'apron');
  };
  walls.push(apron(outerFunnelTop, outerFunnelEnd, LANE_WALL_FACE_X));
  walls.push(apron(innerFunnelTop, innerFunnelEnd, DIVIDER_FACE_X));

  // Pivot caps hide the hinge and seal the gap between funnel and flipper.
  const outerPivot = P(FLIPPER.outerPivotX, FLIPPER.pivotY);
  const innerPivot = P(FLIPPER.innerPivotX, FLIPPER.pivotY);
  for (const p of [outerPivot, innerPivot]) {
    walls.push(
      Matter.Bodies.circle(p.x, p.y, 12, {
        isStatic: true,
        label: 'pivot',
        collisionFilter: { category: COLLISION.wall, mask: COLLISION.ball },
      }),
    );
  }

  // Slingshots.
  const slingTriangle = (ax: number): Point[] => {
    const inner = ax > HALF_CENTRE_X;
    const tri = [
      { x: inner ? swapInner(98) : 98, y: 482 },
      { x: inner ? swapInner(98) : 98, y: 580 },
      { x: inner ? swapInner(146) : 146, y: 614 },
    ];
    return tri.map((p) => P(p.x, p.y));
  };
  const slings: SlingDef[] = [98, swapInner(98)].map((ax) => {
    const [a, b, c] = slingTriangle(ax) as [Point, Point, Point];
    // The kicking face is a→c. Its normal points away from the triangle's third corner b.
    let normal = Matter.Vector.normalise(Matter.Vector.perp({ x: c.x - a.x, y: c.y - a.y }));
    const toB = { x: b.x - a.x, y: b.y - a.y };
    if (Matter.Vector.dot(normal, toB) > 0) normal = Matter.Vector.neg(normal);
    return { body: polygon([a, b, c], 'sling'), normal };
  });

  // Bumpers.
  const bumpers = [P(192, 252), P(336, 226), P(264, 356)].map(makeBumper);

  // Flippers. In the left half the outer flipper is the left one; mirroring swaps that.
  const outerSide: FlipperSide = side === 'left' ? 'left' : 'right';
  const innerSide: FlipperSide = side === 'left' ? 'right' : 'left';
  const flippers = {
    [outerSide]: makeFlipper(slot, outerSide, outerPivot),
    [innerSide]: makeFlipper(slot, innerSide, innerPivot),
  } as Record<FlipperSide, FlipperDef>;

  const drainLeft = LANE_WALL_FACE_X;
  const drain = sensor(mirrorX(side, (drainLeft + DIVIDER_FACE_X) / 2), TABLE_HEIGHT - 8, DIVIDER_FACE_X - drainLeft, 30, `drain`);

  const hazardZone = sensor(mirrorX(side, CENTER_X / 2), TABLE_HEIGHT / 2, CENTER_X, TABLE_HEIGHT, 'hazardZone');
  const kickerZone = sensor(mirrorX(side, 446), 385, 82, 170, 'kickerZone');

  return {
    side,
    slot,
    walls,
    bumpers,
    slings,
    flippers,
    drain,
    laneGate,
    laneZone: bounds(side, PLAYFIELD.outerX, LANE.innerX + 4, 560, TABLE_HEIGHT),
    laneColumn: bounds(side, PLAYFIELD.outerX, LANE.innerX + 4, 186, TABLE_HEIGHT),
    laneSpawn: P(LANE.spawnX, LANE.floorY - 13),
    hazardZone,
    kickerZone,
    kickDir: side === 'left' ? 1 : -1,
    extraBumperSpots: [P(160, 430), P(372, 432), P(268, 150), P(300, 520)],
  };
}
