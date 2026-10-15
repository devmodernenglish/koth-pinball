import {
  HAZARD_COOLDOWN_MS,
  HAZARD_COST,
  MAX_SPECTATOR_POINTS,
  otherSlot,
  type ErrorCode,
  type GameState,
  type HazardKind,
  type PlayerId,
  type Slot,
  type SlotIndex,
  type SlotOccupant,
} from '@koth/shared';

export type ServerEvent =
  | { type: 'join'; playerId: PlayerId; name: string; now: number }
  | { type: 'leave'; playerId: PlayerId; now: number }
  | { type: 'disconnect'; playerId: PlayerId; now: number }
  | { type: 'drain'; loserSlot: SlotIndex; now: number }
  | { type: 'score'; slot: SlotIndex; rallyPoints: number }
  | { type: 'tick'; now: number }
  | { type: 'hazard'; playerId: PlayerId; kind: HazardKind; target: SlotIndex; now: number }
  | { type: 'cabinet'; connected: boolean };

const BOT_NAMES: Record<SlotIndex, string> = { 0: 'Bot Lefty', 1: 'Bot Righty' };

export function botOccupant(index: SlotIndex): SlotOccupant {
  return { kind: 'bot', botId: `bot-${index}`, name: BOT_NAMES[index] };
}

function emptySlot(index: SlotIndex, occupant: SlotOccupant): Slot {
  return { index, occupant, streak: 0, rallyPoints: 0, hazardCooldownUntil: 0 };
}

export function createInitialState(now: number): GameState {
  return {
    slots: [emptySlot(0, botOccupant(0)), emptySlot(1, botOccupant(1))],
    queue: [],
    players: {},
    rally: { servingSlot: 0, startedAt: now },
    cabinetConnected: false,
  };
}

export function slotOf(state: GameState, playerId: PlayerId): SlotIndex | null {
  for (const slot of state.slots) {
    if (slot.occupant.kind === 'human' && slot.occupant.playerId === playerId) return slot.index;
  }
  return null;
}

/** Puts a new occupant in a slot. A new occupant always starts with a fresh streak. */
function seat(state: GameState, index: SlotIndex, occupant: SlotOccupant): void {
  const slot = state.slots[index];
  slot.occupant = occupant;
  slot.streak = 0;
  slot.rallyPoints = 0;
}

function seatHuman(state: GameState, index: SlotIndex, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) return;
  state.queue = state.queue.filter((id) => id !== playerId);
  seat(state, index, { kind: 'human', playerId, name: player.name });
}

/** Fills a slot with the first queued human, or a bot if nobody is waiting. */
function backfill(state: GameState, index: SlotIndex): void {
  const next = state.queue[0];
  if (next !== undefined) seatHuman(state, index, next);
  else seat(state, index, botOccupant(index));
}

function removePlayer(state: GameState, playerId: PlayerId): void {
  if (!state.players[playerId]) return;
  const slot = slotOf(state, playerId);
  delete state.players[playerId];
  state.queue = state.queue.filter((id) => id !== playerId);
  if (slot !== null) backfill(state, slot);
}

export function validateHazard(
  state: GameState,
  playerId: PlayerId,
  kind: HazardKind,
  target: SlotIndex,
  now: number,
): ErrorCode | null {
  const player = state.players[playerId];
  if (!player || !state.queue.includes(playerId)) return 'notInSlot';
  if (target !== 0 && target !== 1) return 'notInSlot';
  if (player.points < HAZARD_COST[kind]) return 'insufficientPoints';
  if (state.slots[target].hazardCooldownUntil > now) return 'cooldown';
  return null;
}

/** Pure state machine. Never mutates its input and performs no I/O. */
export function reduce(state: GameState, event: ServerEvent): GameState {
  const next = structuredClone(state);

  switch (event.type) {
    case 'join': {
      if (next.players[event.playerId]) return state;
      next.players[event.playerId] = { id: event.playerId, name: event.name, points: 0 };
      // Rule 8: a human joining always displaces a bot before entering the queue.
      const botSlot = next.slots.find((s) => s.occupant.kind === 'bot');
      if (botSlot) seatHuman(next, botSlot.index, event.playerId);
      else next.queue.push(event.playerId);
      return next;
    }

    case 'leave':
    case 'disconnect': {
      // Rule 9: removed at once from queue or half; the half is backfilled.
      if (!next.players[event.playerId]) return state;
      removePlayer(next, event.playerId);
      return next;
    }

    case 'drain': {
      const loser = event.loserSlot;
      const winner = otherSlot(loser);
      // Rule 4: winning stays on.
      next.slots[winner].streak += 1;

      const loserOccupant = next.slots[loser].occupant;
      // Rule 3: a human loser goes to the back of the queue.
      if (loserOccupant.kind === 'human') next.queue.push(loserOccupant.playerId);
      // Rules 3 and 6: the first queued human takes the half, otherwise a bot does.
      backfill(next, loser);

      next.slots[0].rallyPoints = 0;
      next.slots[1].rallyPoints = 0;
      // Rule 5: the next ball is served from the incoming challenger's lane.
      next.rally = { servingSlot: loser, startedAt: event.now };
      return next;
    }

    case 'score': {
      const points = Math.max(0, Math.floor(event.rallyPoints));
      if (next.slots[event.slot].rallyPoints === points) return state;
      next.slots[event.slot].rallyPoints = points;
      return next;
    }

    case 'tick': {
      let changed = false;
      for (const id of next.queue) {
        const player = next.players[id];
        if (player && player.points < MAX_SPECTATOR_POINTS) {
          player.points += 1;
          changed = true;
        }
      }
      return changed ? next : state;
    }

    case 'hazard': {
      if (validateHazard(state, event.playerId, event.kind, event.target, event.now) !== null) return state;
      const player = next.players[event.playerId];
      if (!player) return state;
      player.points -= HAZARD_COST[event.kind];
      next.slots[event.target].hazardCooldownUntil = event.now + HAZARD_COOLDOWN_MS;
      return next;
    }

    case 'cabinet': {
      if (next.cabinetConnected === event.connected) return state;
      next.cabinetConnected = event.connected;
      return next;
    }
  }
}
