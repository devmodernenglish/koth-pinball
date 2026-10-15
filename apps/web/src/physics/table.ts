import Matter from 'matter-js';
import {
  SCORE_VALUES,
  STALEMATE_MS,
  type FlipperSide,
  type HazardKind,
  type SlotIndex,
} from '@koth/shared';
import { buildDivider, type DividerDefinition } from './buildDivider';
import { buildHalf, makeBumper, type FlipperDef, type HalfDefinition } from './buildHalf';
import {
  BALL_RADIUS,
  BASE_SPEED_CAP,
  BUMPER,
  CENTER_X,
  COLLISION,
  FIXED_STEP_MS,
  FLIPPER,
  GRAVITY_SCALE,
  GRAVITY_Y,
  INVERTED_GRAVITY_Y,
  KICKER,
  LANE,
  SLING_KICK,
  STALEMATE_SPEED_FACTOR,
  STUCK,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './constants';
import { insideBounds, type Point } from './geometry';

export const TILT_FORCE = 0.0004;

export interface ActiveHazard {
  id: number;
  kind: HazardKind;
  target: SlotIndex;
  until: number;
  /** Tilt direction. */
  dir: 1 | -1;
  bumper: Matter.Body | null;
}

export interface TableEvents {
  drain: (loser: SlotIndex) => void;
  score: (slot: SlotIndex, total: number, reason: keyof typeof SCORE_VALUES) => void;
  cross: (toHalf: SlotIndex) => void;
  hazards: (active: readonly ActiveHazard[]) => void;
  serve: (slot: SlotIndex) => void;
}

type ListenerSets = { [K in keyof TableEvents]: Set<TableEvents[K]> };

type BodyRole =
  | { kind: 'flipper'; slot: SlotIndex }
  | { kind: 'bumper' }
  | { kind: 'sling'; normal: Matter.Vector }
  | { kind: 'drain'; slot: SlotIndex };

const halfOf = (x: number): SlotIndex => (x < CENTER_X ? 0 : 1);

/**
 * The whole shared table: one Matter.js engine and world, one ball (FR-C1).
 * Rendering-agnostic so it can run headless in tests; `usePinballWorld` drives it from requestAnimationFrame.
 */
export class PinballTable {
  readonly engine: Matter.Engine;
  readonly halves: [HalfDefinition, HalfDefinition];
  readonly divider: DividerDefinition;
  readonly flashes = new Map<number, number>(); // body id -> sim time the highlight ends

  ball: Matter.Body | null = null;
  ballHalf: SlotIndex | null = null;
  lastTouchedBy: SlotIndex | null = null;
  rallyPoints: [number, number] = [0, 0];
  time = 0;
  rallyStartedAt = 0;
  crossings = 0;
  hazards: ActiveHazard[] = [];

  private listeners: ListenerSets = {
    drain: new Set(),
    score: new Set(),
    cross: new Set(),
    hazards: new Set(),
    serve: new Set(),
  };
  private roles = new Map<number, BodyRole>();
  private pressed: Record<SlotIndex, Record<FlipperSide, boolean>> = {
    0: { left: false, right: false },
    1: { left: false, right: false },
  };
  private plungerSince: Record<SlotIndex, number | null> = { 0: null, 1: null };
  private laneOpen: Record<SlotIndex, boolean> = { 0: false, 1: false };
  private laneRestSince: number | null = null;
  private stuckSince: number | null = null;
  private kickerReadyAt = 0;
  private pendingDrain: SlotIndex | null = null;
  private hazardSeq = 0;
  private random: () => number;

  constructor(options: { random?: () => number } = {}) {
    this.random = options.random ?? Math.random;
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: GRAVITY_Y, scale: GRAVITY_SCALE },
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 6,
      enableSleeping: false,
    });
    this.halves = [buildHalf('left'), buildHalf('right')];
    this.divider = buildDivider();

    const world = this.engine.world;
    Matter.Composite.add(world, [...this.divider.sections, ...this.divider.frame]);
    for (const half of this.halves) {
      Matter.Composite.add(world, [...half.walls, ...half.bumpers, half.drain, half.laneGate]);
      for (const sling of half.slings) {
        Matter.Composite.add(world, sling.body);
        this.roles.set(sling.body.id, { kind: 'sling', normal: sling.normal });
      }
      for (const bumper of half.bumpers) this.roles.set(bumper.id, { kind: 'bumper' });
      for (const flipper of Object.values(half.flippers)) {
        Matter.Composite.add(world, [flipper.body, flipper.constraint]);
        this.roles.set(flipper.body.id, { kind: 'flipper', slot: half.slot });
      }
      this.roles.set(half.drain.id, { kind: 'drain', slot: half.slot });
    }

    Matter.Events.on(this.engine, 'beforeUpdate', () => this.beforeUpdate());
    Matter.Events.on(this.engine, 'collisionStart', (e) => this.onCollisions(e.pairs));
  }

  /** Subscribes to a table event and returns an unsubscribe function. */
  on<K extends keyof TableEvents>(event: K, listener: TableEvents[K]): () => void {
    const set = this.listeners[event] as Set<TableEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  private emit<K extends keyof TableEvents>(event: K, ...args: Parameters<TableEvents[K]>): void {
    for (const listener of this.listeners[event] as Set<(...a: Parameters<TableEvents[K]>) => void>) listener(...args);
  }

  /** Advances the simulation by exactly one fixed step. */
  step(): void {
    Matter.Engine.update(this.engine, FIXED_STEP_MS);
    this.time += FIXED_STEP_MS;
    this.afterUpdate();
  }

  get speedCap(): number {
    return BASE_SPEED_CAP * (this.isStalemate ? STALEMATE_SPEED_FACTOR : 1);
  }

  get isStalemate(): boolean {
    return this.ball !== null && this.time - this.rallyStartedAt >= STALEMATE_MS;
  }

  setFlipper(slot: SlotIndex, side: FlipperSide, pressed: boolean): void {
    this.pressed[slot][side] = pressed;
  }

  isFlipperPressed(slot: SlotIndex, side: FlipperSide): boolean {
    return this.pressed[slot][side];
  }

  /** Hold to charge, release to launch. */
  setPlunger(slot: SlotIndex, pressed: boolean): void {
    if (pressed) {
      this.plungerSince[slot] ??= this.time;
      return;
    }
    const since = this.plungerSince[slot];
    this.plungerSince[slot] = null;
    if (since === null) return;
    const charge = Math.min(1, (this.time - since) / LANE.chargeMs);
    this.launch(slot, LANE.launchMin + (LANE.launchMax - LANE.launchMin) * charge);
  }

  plungerCharge(slot: SlotIndex): number {
    const since = this.plungerSince[slot];
    return since === null ? 0 : Math.min(1, (this.time - since) / LANE.chargeMs);
  }

  isBallInLane(slot: SlotIndex): boolean {
    return this.ball !== null && insideBounds(this.halves[slot].laneZone, this.ball.position);
  }

  launch(slot: SlotIndex, speed: number): boolean {
    if (!this.ball || !this.isBallInLane(slot)) return false;
    Matter.Body.setVelocity(this.ball, { x: 0, y: -speed });
    this.lastTouchedBy = slot;
    this.laneRestSince = null;
    return true;
  }

  /** Spawns a new ball in a slot's plunger lane and starts a new rally (FR-C6). */
  serve(slot: SlotIndex): void {
    this.removeBall();
    const spawn = this.halves[slot].laneSpawn;
    this.ball = Matter.Bodies.circle(spawn.x, spawn.y, BALL_RADIUS, {
      label: 'ball',
      density: 0.0026,
      restitution: 0.3,
      friction: 0.004,
      frictionStatic: 0,
      frictionAir: 0.0004,
      collisionFilter: { category: COLLISION.ball, mask: COLLISION.wall | COLLISION.flipper },
    });
    Matter.Composite.add(this.engine.world, this.ball);
    this.ballHalf = slot;
    this.lastTouchedBy = null;
    this.rallyPoints = [0, 0];
    this.rallyStartedAt = this.time;
    this.laneRestSince = null;
    this.stuckSince = null;
    this.emit('serve', slot);
  }

  removeBall(): void {
    if (this.ball) Matter.Composite.remove(this.engine.world, this.ball);
    this.ball = null;
    this.ballHalf = null;
    this.pendingDrain = null;
  }

  /** Starts a hazard on one half (FR-C8). */
  applyHazard(kind: HazardKind, target: SlotIndex, durationMs: number): void {
    let bumper: Matter.Body | null = null;
    if (kind === 'extraBumper') {
      const ballPos = this.ball?.position;
      const spots = this.halves[target].extraBumperSpots.filter(
        (p) => !ballPos || Math.hypot(p.x - ballPos.x, p.y - ballPos.y) > BUMPER.radius + BALL_RADIUS + 30,
      );
      const spot = spots[Math.floor(this.random() * spots.length)];
      if (spot) {
        bumper = makeBumper(spot);
        bumper.label = 'extraBumper';
        Matter.Composite.add(this.engine.world, bumper);
        this.roles.set(bumper.id, { kind: 'bumper' });
      }
    }
    this.hazards.push({
      id: ++this.hazardSeq,
      kind,
      target,
      until: this.time + durationMs,
      dir: this.random() < 0.5 ? -1 : 1,
      bumper,
    });
    this.emit('hazards', this.hazards);
  }

  hasHazard(kind: HazardKind, slot: SlotIndex): boolean {
    return this.hazards.some((h) => h.kind === kind && h.target === slot);
  }

  private beforeUpdate(): void {
    const gravity = this.engine.gravity;
    for (const half of this.halves) {
      for (const flipper of Object.values(half.flippers)) {
        this.driveFlipper(flipper, this.pressed[half.slot][flipper.side], gravity);
      }
    }

    const ball = this.ball;
    if (!ball) {
      gravity.y = GRAVITY_Y;
      return;
    }
    const pos = ball.position;
    const half = halfOf(pos.x);

    // Hazards only act while the ball is inside the target half's sensor region.
    const inZone = (slot: SlotIndex): boolean => insideBounds(this.halves[slot].hazardZone.bounds, pos);
    gravity.y = this.hazards.some((h) => h.kind === 'invertGravity' && inZone(h.target)) ? INVERTED_GRAVITY_Y : GRAVITY_Y;
    for (const h of this.hazards) {
      if (h.kind === 'tilt' && inZone(h.target)) {
        Matter.Body.applyForce(ball, pos, { x: h.dir * TILT_FORCE, y: 0 });
      }
    }

    // Stalemate breaker: centre kickers push the ball across (FR-C9).
    if (this.isStalemate && this.time >= this.kickerReadyAt) {
      const kickHalf = this.halves[half];
      if (insideBounds(kickHalf.kickerZone.bounds, pos)) {
        Matter.Body.setVelocity(ball, { x: kickHalf.kickDir * KICKER.speedX, y: KICKER.speedY });
        this.kickerReadyAt = this.time + KICKER.cooldownMs;
        this.flashes.set(kickHalf.kickerZone.id, this.time + 250);
      }
    }

    // One-way lane gates.
    for (const h of this.halves) {
      if (insideBounds(h.laneColumn, pos)) this.laneOpen[h.slot] = true;
      else if (pos.y < 110 || Math.abs(pos.x - h.laneSpawn.x) > 60) this.laneOpen[h.slot] = false;
      h.laneGate.isSensor = this.laneOpen[h.slot];
    }

    // FR-C4: cap the speed every step so nothing tunnels.
    if (Matter.Body.getSpeed(ball) > this.speedCap) Matter.Body.setSpeed(ball, this.speedCap);

    this.trackCrossing(half);
    this.unstick(ball);
  }

  private driveFlipper(f: FlipperDef, pressed: boolean, gravity: Matter.Gravity): void {
    const body = f.body;
    // Flippers float: cancel gravity so only the hinge and our input move them.
    body.force.y -= body.mass * gravity.y * gravity.scale;

    const upSign = Math.sign(f.upAngle - f.restAngle);
    const target = pressed ? f.upAngle : f.restAngle;
    const atLimit = pressed ? (body.angle - f.upAngle) * upSign >= 0 : (body.angle - f.restAngle) * upSign <= 0;
    if (atLimit) {
      this.placeFlipper(f, target);
      Matter.Body.setAngularVelocity(body, 0);
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
    } else {
      const speed = pressed ? FLIPPER.upSpeed : FLIPPER.downSpeed;
      Matter.Body.setAngularVelocity(body, (pressed ? upSign : -upSign) * speed);
    }
  }

  /** Puts a flipper at an exact angle around its pivot, removing hinge drift. */
  private placeFlipper(f: FlipperDef, angle: number): void {
    Matter.Body.setAngle(f.body, angle);
    Matter.Body.setPosition(f.body, {
      x: f.pivot.x + f.dir * f.offset * Math.cos(angle),
      y: f.pivot.y + f.dir * f.offset * Math.sin(angle),
    });
  }

  private trackCrossing(half: SlotIndex): void {
    if (this.ballHalf === null) {
      this.ballHalf = half;
      return;
    }
    if (half === this.ballHalf) return;
    const from = this.ballHalf;
    this.ballHalf = half;
    this.crossings += 1;
    if (this.lastTouchedBy === from) this.addScore(from, 'cross');
    this.emit('cross', half);
  }

  private unstick(ball: Matter.Body): void {
    const resting = Matter.Body.getSpeed(ball) < STUCK.speed;
    const lane = this.halves.find((h) => insideBounds(h.laneZone, ball.position));
    if (lane) {
      this.stuckSince = null;
      if (!resting) {
        this.laneRestSince = null;
        return;
      }
      this.laneRestSince ??= this.time;
      // Nobody launched: auto-launch so the cabinet never stalls.
      if (this.time - this.laneRestSince > LANE.humanAutoLaunchMs) this.launch(lane.slot, LANE.launchMax * 0.85);
      return;
    }
    if (!resting) {
      this.stuckSince = null;
      return;
    }
    this.stuckSince ??= this.time;
    if (this.time - this.stuckSince > STUCK.ms) {
      Matter.Body.setVelocity(ball, { x: (this.random() - 0.5) * 8, y: -6 });
      this.stuckSince = null;
    }
  }

  private onCollisions(pairs: Matter.Pair[]): void {
    const ball = this.ball;
    if (!ball) return;
    for (const pair of pairs) {
      const other = pair.bodyA === ball ? pair.bodyB : pair.bodyB === ball ? pair.bodyA : null;
      if (!other) continue;
      // Compound bodies report their parts; roles are registered on the parent.
      const role = this.roles.get(other.id) ?? this.roles.get(other.parent.id);
      if (!role) continue;
      switch (role.kind) {
        case 'flipper':
          this.lastTouchedBy = role.slot; // FR-C5
          break;
        case 'bumper': {
          const centre = other.parent.position;
          const away = Matter.Vector.normalise(Matter.Vector.sub(ball.position, centre));
          Matter.Body.setVelocity(ball, Matter.Vector.mult(away, BUMPER.kick));
          this.flashes.set(other.parent.id, this.time + 160);
          this.scoreLastTouch('bumper');
          break;
        }
        case 'sling': {
          // Mostly sideways with a little randomness, so two slings can't trap the ball in a perfect loop.
          const kick = SLING_KICK * (0.8 + this.random() * 0.35);
          Matter.Body.setVelocity(ball, { x: role.normal.x * kick, y: Math.max(role.normal.y * kick, -1.5) + this.random() });
          this.flashes.set(other.parent.id, this.time + 140);
          this.scoreLastTouch('slingshot');
          break;
        }
        case 'drain':
          this.pendingDrain ??= role.slot;
          break;
      }
    }
  }

  private scoreLastTouch(reason: keyof typeof SCORE_VALUES): void {
    if (this.lastTouchedBy !== null) this.addScore(this.lastTouchedBy, reason);
  }

  private addScore(slot: SlotIndex, reason: keyof typeof SCORE_VALUES): void {
    this.rallyPoints[slot] += SCORE_VALUES[reason];
    this.emit('score', slot, this.rallyPoints[slot], reason);
  }

  private afterUpdate(): void {
    // Expire hazards.
    const expired = this.hazards.filter((h) => h.until <= this.time);
    if (expired.length > 0) {
      for (const h of expired) {
        if (h.bumper) {
          Matter.Composite.remove(this.engine.world, h.bumper);
          this.roles.delete(h.bumper.id);
        }
      }
      this.hazards = this.hazards.filter((h) => h.until > this.time);
      this.emit('hazards', this.hazards);
    }

    const ball = this.ball;
    if (!ball) return;
    // Safety net: a ball that somehow leaves the table counts as a drain on the half it left from.
    const p: Point = ball.position;
    if (this.pendingDrain === null && (p.y > TABLE_HEIGHT + 40 || p.y < -40 || p.x < -40 || p.x > TABLE_WIDTH + 40)) {
      this.pendingDrain = halfOf(Math.min(Math.max(p.x, 0), TABLE_WIDTH - 1));
    }
    if (this.pendingDrain !== null) {
      const loser = this.pendingDrain;
      this.removeBall();
      this.emit('drain', loser);
    }
  }
}
