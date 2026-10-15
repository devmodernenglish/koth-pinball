// Table geometry and tuning. One table "unit" (PRD: ~2 × 1.6 units) is 500 world px.
export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 800;
export const CENTER_X = TABLE_WIDTH / 2;

/** Fixed physics step: 1/120 s, two substeps per 60 fps frame (FR-C1). */
export const FIXED_STEP_MS = 1000 / 120;
export const MAX_STEPS_PER_FRAME = 6;

export const GRAVITY_Y = 1;
export const GRAVITY_SCALE = 0.00085;
export const INVERTED_GRAVITY_Y = -0.6;

export const BALL_RADIUS = 11;
/** Speed cap in Matter units (px per 1/60 s). 13 px per substep stays below ball radius + half wall thickness. */
export const BASE_SPEED_CAP = 24;
export const STALEMATE_SPEED_FACTOR = 1.2;

export const WALL_THICKNESS = 18;
export const OUTER_WALL_THICKNESS = 80;

export const PLAYFIELD = {
  top: 10,
  bottom: 800,
  outerX: 10, // inner face of the outer wall (left-half coordinates)
} as const;

export const LANE = {
  innerX: 44, // lane is outerX..innerX
  wallX: 53, // centre line of the lane wall
  wallTop: 175,
  floorY: 772,
  spawnX: 27,
  launchMin: 15,
  launchMax: 23.5,
  chargeMs: 900,
  humanAutoLaunchMs: 8000,
} as const;

export const CORNER_ARC = { cx: 135, cy: 135, radius: 125, segments: 10 } as const;

export const DIVIDER = {
  thickness: 26,
  archBottom: 175, // the top arch opening spans PLAYFIELD.top..archBottom
  midGapTop: 320,
  midGapBottom: 440,
} as const;

export const FLIPPER = {
  length: 112,
  thickness: 20,
  outerPivotX: 140,
  innerPivotX: 404,
  pivotY: 680,
  restAngle: 0.5,
  upAngle: -0.42,
  upSpeed: 0.3, // rad per 1/60 s
  downSpeed: 0.16,
  density: 0.02,
} as const;

export const BUMPER = { radius: 24, kick: 10.5 } as const;
export const SLING_KICK = 7.5;

export const BOT = {
  reactionMinMs: 40,
  reactionMaxMs: 120,
  missChance: 0.1,
  holdMs: 150,
  autoLaunchMs: 1000,
  rearmMs: 220,
} as const;

export const KICKER = { speedX: 9, speedY: 1.5, cooldownMs: 600 } as const;
export const STUCK = { speed: 0.35, ms: 3500 } as const;

export const COLLISION = {
  wall: 0x0001,
  ball: 0x0002,
  flipper: 0x0004,
} as const;
