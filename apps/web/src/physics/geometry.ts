import Matter from 'matter-js';
import { COLLISION, TABLE_WIDTH, WALL_THICKNESS } from './constants';

export type HalfSide = 'left' | 'right';
export interface Point {
  x: number;
  y: number;
}

/** Mirrors an x coordinate (given in left-half space) into the requested half. */
export const mirrorX = (side: HalfSide, x: number): number => (side === 'left' ? x : TABLE_WIDTH - x);
export const mirrorPoint = (side: HalfSide, p: Point): Point => ({ x: mirrorX(side, p.x), y: p.y });

const wallOptions = (label: string): Matter.IChamferableBodyDefinition => ({
  isStatic: true,
  label,
  restitution: 0.25,
  friction: 0.02,
  collisionFilter: { category: COLLISION.wall, mask: COLLISION.ball },
});

/** A thick wall centred on the line a→b, slightly overlong so joints don't leave gaps. */
export function segment(a: Point, b: Point, label = 'wall', thickness = WALL_THICKNESS): Matter.Body {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) + thickness * 0.6;
  return Matter.Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, length, thickness, {
    ...wallOptions(label),
    angle: Math.atan2(dy, dx),
    chamfer: { radius: thickness / 2 - 1 },
  });
}

export function box(x: number, y: number, w: number, h: number, label = 'wall'): Matter.Body {
  return Matter.Bodies.rectangle(x, y, w, h, wallOptions(label));
}

export function polygon(points: Point[], label: string): Matter.Body {
  const centre = Matter.Vertices.centre(points);
  const body = Matter.Bodies.fromVertices(centre.x, centre.y, [points], wallOptions(label));
  // fromVertices positions by centre of mass, which equals the centroid for convex shapes.
  Matter.Body.setPosition(body, centre);
  return body;
}

export function sensor(x: number, y: number, w: number, h: number, label: string): Matter.Body {
  return Matter.Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    isSensor: true,
    label,
    collisionFilter: { category: COLLISION.wall, mask: COLLISION.ball },
  });
}

/** Points along an arc, for building curved walls out of short segments. */
export function arcPoints(cx: number, cy: number, r: number, from: number, to: number, segments: number): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / segments;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

export const insideBounds = (b: Matter.Bounds, p: Point): boolean =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y;
