import type Matter from 'matter-js';
import type { SlotIndex } from '@koth/shared';
import { BALL_RADIUS, CENTER_X, CORNER_ARC, LANE, PLAYFIELD, TABLE_HEIGHT, TABLE_WIDTH, WALL_THICKNESS } from './constants';
import { mirrorX } from './geometry';
import type { PinballTable } from './table';

/** Colours come from the design tokens exposed as CSS custom properties, so the canvas follows the theme. */
export interface TableTheme {
  tableBg: string;
  wall: string;
  wallEdge: string;
  bumper: string;
  bumperFlash: string;
  ball: string;
  ballShade: string;
  drain: string;
  hazard: string;
  players: [string, string];
}

const TOKEN_NAMES: Record<Exclude<keyof TableTheme, 'players'>, string> = {
  tableBg: 'table-bg',
  wall: 'table-wall',
  wallEdge: 'table-wall-edge',
  bumper: 'bumper',
  bumperFlash: 'bumper-flash',
  ball: 'ball',
  ballShade: 'ball-shade',
  drain: 'drain',
  hazard: 'hazard',
};

export function readTheme(el: Element): TableTheme {
  const style = getComputedStyle(el);
  const v = (name: string): string => style.getPropertyValue(`--color-${name}`).trim() || 'white';
  const entries = Object.entries(TOKEN_NAMES).map(([key, token]) => [key, v(token)]);
  return { ...(Object.fromEntries(entries) as Omit<TableTheme, 'players'>), players: [v('player-a'), v('player-b')] };
}

function tracePath(ctx: CanvasRenderingContext2D, body: Matter.Body): void {
  const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
  for (const part of parts) {
    const [first, ...rest] = part.vertices;
    if (!first) continue;
    ctx.moveTo(first.x, first.y);
    for (const v of rest) ctx.lineTo(v.x, v.y);
    ctx.closePath();
  }
}

function fillBodies(ctx: CanvasRenderingContext2D, bodies: Matter.Body[], fill: string, stroke?: string): void {
  ctx.beginPath();
  for (const b of bodies) tracePath(ctx, b);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export interface RenderOptions {
  activeHalf: SlotIndex | null;
  stalemate: boolean;
}

/** Draws everything that never moves (walls, divider, drains) in world units. Cached by the caller. */
export function renderStatic(ctx: CanvasRenderingContext2D, table: PinballTable, theme: TableTheme): void {
  // Drain mouths.
  for (const half of table.halves) {
    const b = half.drain.bounds;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = theme.drain;
    ctx.fillRect(b.min.x, b.min.y, b.max.x - b.min.x, b.max.y - b.min.y);
    ctx.globalAlpha = 1;
  }

  // Corners behind the launch arcs.
  for (const side of ['left', 'right'] as const) {
    ctx.beginPath();
    ctx.moveTo(mirrorX(side, 0), 0);
    ctx.lineTo(mirrorX(side, CORNER_ARC.cx), 0);
    ctx.lineTo(mirrorX(side, CORNER_ARC.cx), PLAYFIELD.top);
    ctx.arc(mirrorX(side, CORNER_ARC.cx), CORNER_ARC.cy, CORNER_ARC.radius, -Math.PI / 2, -Math.PI / 2 - (side === 'left' ? 1 : -1) * (Math.PI / 2), side === 'left');
    ctx.lineTo(mirrorX(side, 0), CORNER_ARC.cy);
    ctx.closePath();
    ctx.fillStyle = theme.wall;
    ctx.fill();
  }

  // Static walls and the divider.
  const walls = [...table.divider.sections, ...table.halves.flatMap((h) => h.walls)].filter((b) => b.label !== 'arc');
  fillBodies(ctx, walls, theme.wall, theme.wallEdge);

  // The launch arcs are many short segments physically; draw them as one smooth curve.
  for (const side of ['left', 'right'] as const) {
    const cx = mirrorX(side, CORNER_ARC.cx);
    const r = CORNER_ARC.radius + WALL_THICKNESS / 2;
    const [from, to] = side === 'left' ? [Math.PI, Math.PI * 1.5] : [Math.PI * 1.5, Math.PI * 2];
    ctx.beginPath();
    ctx.arc(cx, CORNER_ARC.cy, r, from, to);
    ctx.lineWidth = WALL_THICKNESS;
    ctx.strokeStyle = theme.wall;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, CORNER_ARC.cy, CORNER_ARC.radius, from, to);
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.wallEdge;
    ctx.stroke();
  }

}

/** Draws the whole table in world units. The caller sets the transform that fits it to the canvas. */
export function renderTable(
  ctx: CanvasRenderingContext2D,
  table: PinballTable,
  theme: TableTheme,
  opts: RenderOptions,
  staticLayer?: CanvasImageSource,
): void {
  const now = table.time;
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  ctx.fillStyle = theme.tableBg;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  // Half tints and the active-half highlight (FR-C7).
  for (const slot of [0, 1] as const) {
    const x = slot === 0 ? 0 : CENTER_X;
    const grad = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
    ctx.globalAlpha = opts.activeHalf === slot ? 0.26 : 0.1;
    grad.addColorStop(0, theme.players[slot]);
    grad.addColorStop(1, theme.tableBg);
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, CENTER_X, TABLE_HEIGHT);
    ctx.globalAlpha = 1;
    if (opts.activeHalf === slot) {
      ctx.strokeStyle = theme.players[slot];
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 6, 6, CENTER_X - 12, TABLE_HEIGHT - 12);
    }
  }

  // Hazard washes.
  for (const h of table.hazards) {
    const x = h.target === 0 ? 0 : CENTER_X;
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(now / 90);
    ctx.fillStyle = theme.hazard;
    ctx.fillRect(x, 0, CENTER_X, TABLE_HEIGHT);
    ctx.globalAlpha = 1;
  }

  // Stalemate kickers.
  if (opts.stalemate) {
    for (const half of table.halves) {
      const b = half.kickerZone.bounds;
      const flash = (table.flashes.get(half.kickerZone.id) ?? 0) > now;
      ctx.globalAlpha = flash ? 0.7 : 0.25 + 0.15 * Math.sin(now / 120);
      ctx.fillStyle = theme.bumper;
      const cx = (b.min.x + b.max.x) / 2;
      const cy = (b.min.y + b.max.y) / 2;
      ctx.beginPath();
      ctx.moveTo(cx - half.kickDir * 26, cy - 34);
      ctx.lineTo(cx + half.kickDir * 30, cy);
      ctx.lineTo(cx - half.kickDir * 26, cy + 34);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  if (staticLayer) ctx.drawImage(staticLayer, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  else renderStatic(ctx, table, theme);

  // Lane gates: dashed while open.
  for (const half of table.halves) {
    ctx.save();
    ctx.setLineDash(half.laneGate.isSensor ? [4, 6] : []);
    ctx.beginPath();
    tracePath(ctx, half.laneGate);
    ctx.strokeStyle = theme.wallEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Plunger charge meter.
    const charge = table.plungerCharge(half.slot);
    const x = mirrorX(half.side, LANE.spawnX);
    ctx.fillStyle = theme.players[half.slot];
    ctx.globalAlpha = 0.85;
    const h = 8 + charge * 40;
    ctx.fillRect(x - 10, LANE.floorY + 2, 20, Math.max(4, 22 - charge * 18));
    if (charge > 0) ctx.fillRect(x - 3, LANE.floorY - h - BALL_RADIUS * 2, 6, h);
    ctx.globalAlpha = 1;
  }

  // Slingshots.
  for (const half of table.halves) {
    for (const sling of half.slings) {
      const flash = (table.flashes.get(sling.body.id) ?? 0) > now;
      fillBodies(ctx, [sling.body], flash ? theme.bumperFlash : theme.wall, theme.players[half.slot]);
    }
  }

  // Bumpers, including temporary hazard bumpers.
  const bumpers = [...table.halves.flatMap((h) => h.bumpers), ...table.hazards.flatMap((h) => (h.bumper ? [h.bumper] : []))];
  for (const b of bumpers) {
    const r = b.circleRadius ?? 20;
    const flash = (table.flashes.get(b.id) ?? 0) > now;
    const extra = b.label === 'extraBumper';
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, r + (flash ? 4 : 0), 0, Math.PI * 2);
    ctx.fillStyle = flash ? theme.bumperFlash : extra ? theme.hazard : theme.bumper;
    ctx.shadowColor = extra ? theme.hazard : theme.bumper;
    ctx.shadowBlur = flash ? 30 : 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = theme.tableBg;
    ctx.fill();
  }

  // Flippers in their player's colour.
  for (const half of table.halves) {
    for (const f of Object.values(half.flippers)) {
      ctx.shadowColor = theme.players[half.slot];
      ctx.shadowBlur = table.isFlipperPressed(half.slot, f.side) ? 22 : 8;
      fillBodies(ctx, [f.body], theme.players[half.slot]);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(f.pivot.x, f.pivot.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.tableBg;
      ctx.fill();
    }
  }

  // The ball.
  const ball = table.ball;
  if (ball) {
    const { x, y } = ball.position;
    const g = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, BALL_RADIUS);
    g.addColorStop(0, theme.bumperFlash);
    g.addColorStop(0.45, theme.ball);
    g.addColorStop(1, theme.ballShade);
    ctx.shadowColor = theme.ball;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
