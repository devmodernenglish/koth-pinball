import Matter from 'matter-js';
import type { FlipperSide, SlotIndex } from '@koth/shared';
import { BOT, FLIPPER, LANE } from './constants';
import type { FlipperDef } from './buildHalf';
import type { PinballTable } from './table';

interface FlipperPlan {
  pressAt: number | null;
  releaseAt: number | null;
  rearmAt: number;
  /** Set when the bot decided to "miss" this approach; cleared once the ball leaves the zone. */
  ignoring: boolean;
}

const SIDES: FlipperSide[] = ['left', 'right'];

/**
 * Bot logic for one slot (FR-B1..FR-B4). Pure TypeScript over the table, driven from the engine's
 * beforeUpdate hook, using simulation time so it behaves identically headless and on screen.
 */
export class BotBrain {
  private plans: Record<FlipperSide, FlipperPlan> = {
    left: { pressAt: null, releaseAt: null, rearmAt: 0, ignoring: false },
    right: { pressAt: null, releaseAt: null, rearmAt: 0, ignoring: false },
  };
  private laneSince: number | null = null;
  private wasActive = false;

  constructor(
    private readonly table: PinballTable,
    readonly slot: SlotIndex,
    private readonly isActive: () => boolean,
    private readonly random: () => number = Math.random,
  ) {}

  update(): void {
    const active = this.isActive();
    if (!active) {
      if (this.wasActive) this.releaseAll();
      this.wasActive = false;
      return;
    }
    this.wasActive = true;
    const { table, slot } = this;
    const now = table.time;
    const ball = table.ball;

    // FR-B4: auto-launch 1 s after the ball lands in our lane.
    if (ball && table.isBallInLane(slot) && Matter.Body.getSpeed(ball) < 0.5) {
      this.laneSince ??= now;
      if (now - this.laneSince >= BOT.autoLaunchMs) {
        const strength = 0.55 + this.random() * 0.45;
        table.launch(slot, LANE.launchMin + (LANE.launchMax - LANE.launchMin) * strength);
        this.laneSince = null;
      }
    } else {
      this.laneSince = null;
    }

    for (const side of SIDES) {
      const plan = this.plans[side];
      const flipper = table.halves[slot].flippers[side];

      if (plan.releaseAt !== null && now >= plan.releaseAt) {
        table.setFlipper(slot, side, false);
        plan.releaseAt = null;
        plan.rearmAt = now + BOT.rearmMs;
      }
      if (plan.pressAt !== null && now >= plan.pressAt) {
        table.setFlipper(slot, side, true);
        plan.pressAt = null;
        plan.releaseAt = now + BOT.holdMs;
      }

      // FR-B2: only act while the ball is in our half, falling, inside this flipper's strike zone.
      const inZone = ball !== null && table.ballHalf === slot && this.inStrikeZone(flipper, ball);
      if (!inZone) {
        plan.ignoring = false;
        continue;
      }
      const falling = Matter.Body.getVelocity(ball).y > 0;
      const idle = plan.pressAt === null && plan.releaseAt === null && now >= plan.rearmAt;
      if (!falling || !idle || plan.ignoring) continue;

      // FR-B3: human-ish reaction time and an occasional miss.
      if (this.random() < BOT.missChance) {
        plan.ignoring = true;
        continue;
      }
      plan.pressAt = now + BOT.reactionMinMs + this.random() * (BOT.reactionMaxMs - BOT.reactionMinMs);
    }
  }

  private inStrikeZone(f: FlipperDef, ball: Matter.Body): boolean {
    const reach = FLIPPER.length * Math.cos(FLIPPER.restAngle);
    const x = ball.position.x;
    const y = ball.position.y;
    const minX = f.dir > 0 ? f.pivot.x - 10 : f.pivot.x - reach - 18;
    const maxX = f.dir > 0 ? f.pivot.x + reach + 18 : f.pivot.x + 10;
    return x >= minX && x <= maxX && y >= f.pivot.y - 75 && y <= f.pivot.y + 55;
  }

  releaseAll(): void {
    for (const side of SIDES) {
      this.table.setFlipper(this.slot, side, false);
      this.plans[side] = { pressAt: null, releaseAt: null, rearmAt: 0, ignoring: false };
    }
    this.laneSince = null;
  }
}

/** Small deterministic PRNG for reproducible headless runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
