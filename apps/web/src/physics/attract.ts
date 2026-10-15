import Matter from 'matter-js';
import { otherSlot, type SlotIndex } from '@koth/shared';
import { BotBrain, mulberry32 } from './botBrain';
import { BALL_RADIUS, CENTER_X, DIVIDER, TABLE_HEIGHT, TABLE_WIDTH } from './constants';
import { PinballTable } from './table';

export interface AttractStats {
  rallies: number;
  crossings: number;
  crossingsPerRally: number;
  averageRallyMs: number;
  longestRallyMs: number;
  tunnels: number;
  escapes: number;
  wins: [number, number];
}

/**
 * Runs bot-vs-bot attract mode headless for `simMs` of simulated time and reports rally statistics
 * plus any frame where the ball was inside the divider or outside the table.
 */
export function runAttract(simMs: number, seed = 1): AttractStats {
  const random = mulberry32(seed);
  const table = new PinballTable({ random });
  const bots = ([0, 1] as SlotIndex[]).map((s) => new BotBrain(table, s, () => true, random));
  Matter.Events.on(table.engine, 'beforeUpdate', () => bots.forEach((b) => b.update()));

  let rallies = 0;
  let rallyMsTotal = 0;
  let longest = 0;
  let tunnels = 0;
  let escapes = 0;
  const wins: [number, number] = [0, 0];
  let serveAt: number | null = null;
  let serveSlot: SlotIndex = 0;

  table.on('drain', (loser) => {
      rallies += 1;
      const length = table.time - table.rallyStartedAt;
      rallyMsTotal += length;
      longest = Math.max(longest, length);
      wins[otherSlot(loser)] += 1;
      serveSlot = loser;
      serveAt = table.time + 1000;
  });
  table.serve(0);

  const crossingsAtStart = table.crossings;
  while (table.time < simMs) {
    if (serveAt !== null && table.time >= serveAt) {
      table.serve(serveSlot);
      serveAt = null;
    }
    table.step();
    const ball = table.ball;
    if (!ball) continue;
    const { x, y } = ball.position;
    const inDividerX = Math.abs(x - CENTER_X) < DIVIDER.thickness / 2 + BALL_RADIUS - 4;
    const inSolidDivider =
      (y > DIVIDER.archBottom + DIVIDER.thickness / 2 && y < DIVIDER.midGapTop - DIVIDER.thickness / 2) ||
      y > DIVIDER.midGapBottom + DIVIDER.thickness / 2;
    if (inDividerX && inSolidDivider) tunnels += 1;
    if (x < 0 || x > TABLE_WIDTH || y < 0 || y > TABLE_HEIGHT + 20) escapes += 1;
  }

  const crossings = table.crossings - crossingsAtStart;
  return {
    rallies,
    crossings,
    crossingsPerRally: rallies > 0 ? crossings / rallies : crossings,
    averageRallyMs: rallies > 0 ? rallyMsTotal / rallies : 0,
    longestRallyMs: longest,
    tunnels,
    escapes,
    wins,
  };
}
