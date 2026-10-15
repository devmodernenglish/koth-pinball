import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { runAttract } from './attract';
import { PinballTable } from './table';
import { CENTER_X, STALEMATE_SPEED_FACTOR, BASE_SPEED_CAP } from './constants';

describe('shared table', () => {
  it('builds mirrored halves', () => {
    const table = new PinballTable();
    const [left, right] = table.halves;
    expect(left.flippers.left.pivot.x + right.flippers.right.pivot.x).toBeCloseTo(CENTER_X * 2);
    expect(left.bumpers.length).toBe(3);
    expect(right.slings.length).toBe(2);
  });

  it('serves into the requested plunger lane and launches from there', () => {
    const table = new PinballTable();
    table.serve(1);
    expect(table.isBallInLane(1)).toBe(true);
    for (let i = 0; i < 30; i++) table.step();
    expect(table.launch(1, 20)).toBe(true);
    expect(table.lastTouchedBy).toBe(1);
  });

  it('applies tilt only inside the target half', () => {
    const table = new PinballTable({ random: () => 0.9 });
    table.serve(0);
    const ball = table.ball as Matter.Body;
    Matter.Body.setPosition(ball, { x: 260, y: 200 });
    table.applyHazard('tilt', 1, 5000);
    table.engine.gravity.y = 0;
    table.step();
    expect(Math.abs(Matter.Body.getVelocity(ball).x)).toBeLessThan(0.01);
  });

  it('inverts gravity only while the ball is in the target half', () => {
    const table = new PinballTable();
    table.serve(0);
    Matter.Body.setPosition(table.ball as Matter.Body, { x: 260, y: 200 });
    table.applyHazard('invertGravity', 0, 5000);
    table.step();
    expect(table.engine.gravity.y).toBeLessThan(0);
    Matter.Body.setPosition(table.ball as Matter.Body, { x: 740, y: 200 });
    table.step();
    expect(table.engine.gravity.y).toBeGreaterThan(0);
  });

  it('adds and removes a temporary bumper', () => {
    const table = new PinballTable();
    table.serve(0);
    const count = () => Matter.Composite.allBodies(table.engine.world).length;
    const before = count();
    table.applyHazard('extraBumper', 1, 100);
    expect(count()).toBe(before + 1);
    for (let i = 0; i < 20; i++) table.step();
    expect(count()).toBe(before);
  });

  it('raises the speed cap during a stalemate', () => {
    const table = new PinballTable();
    table.serve(0);
    expect(table.speedCap).toBe(BASE_SPEED_CAP);
    table.rallyStartedAt = table.time - 61_000;
    expect(table.speedCap).toBeCloseTo(BASE_SPEED_CAP * STALEMATE_SPEED_FACTOR);
  });
});

describe('bot attract mode (acceptance)', () => {
  it('plays rallies indefinitely, crosses the centre, and never tunnels', () => {
    const stats = runAttract(5 * 60_000, 7); // five simulated minutes
    expect(stats.rallies).toBeGreaterThan(5);
    expect(stats.crossingsPerRally).toBeGreaterThanOrEqual(1);
    expect(stats.tunnels).toBe(0);
    expect(stats.escapes).toBe(0);
    expect(stats.wins[0]).toBeGreaterThan(0);
    expect(stats.wins[1]).toBeGreaterThan(0);
  }, 60_000);
});
