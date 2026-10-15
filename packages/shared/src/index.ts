// Shared data contracts for King of the Hill Pinball.
// Imported by both the server and the web app. Keep this file free of runtime dependencies.

export type PlayerId = string;
export type SlotIndex = 0 | 1; // 0 = left half, 1 = right half
export type HazardKind = 'tilt' | 'extraBumper' | 'invertGravity';
export type FlipperSide = 'left' | 'right';
export type InputSide = FlipperSide | 'plunger';

export type SlotOccupant =
  | { kind: 'human'; playerId: PlayerId; name: string }
  | { kind: 'bot'; botId: string; name: string };

export interface Slot {
  index: SlotIndex;
  occupant: SlotOccupant;
  streak: number; // rallies won in a row
  rallyPoints: number;
  hazardCooldownUntil: number; // epoch ms
}

export interface Player {
  id: PlayerId;
  name: string;
  points: number; // spectator points
}

export interface RallyState {
  servingSlot: SlotIndex;
  startedAt: number; // epoch ms
}

export interface GameState {
  slots: [Slot, Slot];
  queue: PlayerId[];
  players: Record<PlayerId, Player>;
  rally: RallyState;
  cabinetConnected: boolean;
}

export type ErrorCode = 'insufficientPoints' | 'cooldown' | 'notInSlot';

export type ClientToServer =
  | { type: 'hello'; role: 'cabinet' | 'controller'; name?: string }
  | { type: 'input'; side: InputSide; pressed: boolean }
  | { type: 'hazard'; kind: HazardKind; target: SlotIndex }
  | { type: 'drain'; loserSlot: SlotIndex } // cabinet only
  | { type: 'score'; slot: SlotIndex; rallyPoints: number }; // cabinet only, max 4/s

export type ServerToClient =
  | { type: 'welcome'; playerId: PlayerId }
  | { type: 'state'; state: GameState }
  | { type: 'input'; slot: SlotIndex; side: InputSide; pressed: boolean } // to cabinet
  | { type: 'hazard'; kind: HazardKind; target: SlotIndex; durationMs: number } // to cabinet
  | { type: 'serve'; slot: SlotIndex } // to cabinet
  | { type: 'error'; code: ErrorCode; message: string };

export const HAZARD_COST: Record<HazardKind, number> = { tilt: 10, extraBumper: 15, invertGravity: 25 };
export const HAZARD_DURATION_MS = 5000;
export const HAZARD_COOLDOWN_MS = 5000;
export const STALEMATE_MS = 60000;
export const MAX_SPECTATOR_POINTS = 30;
export const SCORE_VALUES = { bumper: 100, slingshot: 50, cross: 250 } as const;

export const HAZARD_LABELS: Record<HazardKind, string> = {
  tilt: 'Tilt',
  extraBumper: 'Extra bumper',
  invertGravity: 'Inverted gravity',
};

export const SLOT_LABELS: Record<SlotIndex, 'LEFT' | 'RIGHT'> = { 0: 'LEFT', 1: 'RIGHT' };

export const otherSlot = (slot: SlotIndex): SlotIndex => (slot === 0 ? 1 : 0);
