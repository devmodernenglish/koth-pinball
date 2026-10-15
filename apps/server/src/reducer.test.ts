import { describe, expect, it } from 'vitest';
import { HAZARD_COST, MAX_SPECTATOR_POINTS, type GameState } from '@koth/shared';
import { createInitialState, reduce, slotOf, validateHazard, type ServerEvent } from './reducer';

const T0 = 1_000_000;

function run(state: GameState, ...events: ServerEvent[]): GameState {
  return events.reduce(reduce, state);
}

function join(playerId: string, name = playerId.toUpperCase()): ServerEvent {
  return { type: 'join', playerId, name, now: T0 };
}

function ticks(n: number): ServerEvent[] {
  return Array.from({ length: n }, (_, i) => ({ type: 'tick', now: T0 + (i + 1) * 1000 }) as const);
}

describe('initial state', () => {
  it('starts with two bots in attract mode (rule 7)', () => {
    const s = createInitialState(T0);
    expect(s.slots.map((x) => x.occupant.kind)).toEqual(['bot', 'bot']);
    expect(s.queue).toEqual([]);
  });
});

describe('join', () => {
  it('a human displaces a bot before entering the queue (rule 8)', () => {
    const s = run(createInitialState(T0), join('a'));
    expect(slotOf(s, 'a')).toBe(0);
    expect(s.slots[1].occupant.kind).toBe('bot');
    expect(s.queue).toEqual([]);
  });

  it('the second human takes the other bot half, the third queues', () => {
    const s = run(createInitialState(T0), join('a'), join('b'), join('c'));
    expect(slotOf(s, 'a')).toBe(0);
    expect(slotOf(s, 'b')).toBe(1);
    expect(s.queue).toEqual(['c']);
  });

  it('a displaced bot slot starts with a fresh streak', () => {
    let s = createInitialState(T0);
    s = run(s, { type: 'drain', loserSlot: 1, now: T0 }); // bot 0 streak 1
    s = run(s, join('a'));
    expect(s.slots[0].streak).toBe(0);
  });

  it('ignores a duplicate join', () => {
    const s1 = run(createInitialState(T0), join('a'));
    expect(reduce(s1, join('a'))).toBe(s1);
  });

  it('does not mutate its input', () => {
    const s = createInitialState(T0);
    const snapshot = structuredClone(s);
    reduce(s, join('a'));
    expect(s).toEqual(snapshot);
  });
});

describe('drain', () => {
  it('increments the winner streak and keeps the winner in place (rules 2 and 4)', () => {
    const s = run(createInitialState(T0), join('a'), join('b'), { type: 'drain', loserSlot: 1, now: T0 });
    expect(slotOf(s, 'a')).toBe(0);
    expect(s.slots[0].streak).toBe(1);
  });

  it('rotates a human loser to the back and seats the first queued human (rule 3)', () => {
    let s = run(createInitialState(T0), join('a'), join('b'), join('c'), join('d'));
    s = reduce(s, { type: 'drain', loserSlot: 1, now: T0 + 5 });
    expect(slotOf(s, 'c')).toBe(1);
    expect(s.queue).toEqual(['d', 'b']);
    expect(s.slots[1].streak).toBe(0);
  });

  it('serves the next ball from the incoming challenger lane (rule 5)', () => {
    const s = run(createInitialState(T0), join('a'), join('b'), join('c'), {
      type: 'drain',
      loserSlot: 0,
      now: T0 + 42,
    });
    expect(s.rally).toEqual({ servingSlot: 0, startedAt: T0 + 42 });
    expect(slotOf(s, 'c')).toBe(0);
  });

  it('a losing bot stays when nobody is waiting (rule 6)', () => {
    const s = run(createInitialState(T0), join('a'), { type: 'drain', loserSlot: 1, now: T0 });
    expect(s.slots[1].occupant.kind).toBe('bot');
    expect(s.slots[0].streak).toBe(1);
  });

  it('never leaves a bot in a half while a human is waiting (rule 6)', () => {
    let s = createInitialState(T0);
    const events: ServerEvent[] = [join('a'), join('b'), join('c'), join('d')];
    for (let i = 0; i < 20; i++) events.push({ type: 'drain', loserSlot: (i % 2) as 0 | 1, now: T0 + i });
    events.push({ type: 'leave', playerId: 'a', now: T0 }, { type: 'leave', playerId: 'b', now: T0 });
    for (const e of events) {
      s = reduce(s, e);
      if (s.queue.length > 0) expect(s.slots.every((x) => x.occupant.kind === 'human')).toBe(true);
    }
  });

  it('a lone human who loses to a bot rotates back into the half (winning-stays-on with a queue of one)', () => {
    const s = run(createInitialState(T0), join('a'), { type: 'drain', loserSlot: 0, now: T0 });
    expect(slotOf(s, 'a')).toBe(0);
    expect(s.queue).toEqual([]);
    expect(s.slots[1].streak).toBe(1);
  });

  it('two bots play an endless match (rule 7)', () => {
    let s = createInitialState(T0);
    for (let i = 0; i < 10; i++) s = reduce(s, { type: 'drain', loserSlot: (i % 2) as 0 | 1, now: T0 + i });
    expect(s.slots.every((x) => x.occupant.kind === 'bot')).toBe(true);
  });

  it('resets rally points for the new rally', () => {
    let s = run(createInitialState(T0), { type: 'score', slot: 0, rallyPoints: 500 });
    expect(s.slots[0].rallyPoints).toBe(500);
    s = reduce(s, { type: 'drain', loserSlot: 1, now: T0 });
    expect(s.slots[0].rallyPoints).toBe(0);
  });
});

describe('leave and disconnect (rule 9)', () => {
  it('removes a queued player', () => {
    let s = run(createInitialState(T0), join('a'), join('b'), join('c'));
    s = reduce(s, { type: 'disconnect', playerId: 'c', now: T0 });
    expect(s.queue).toEqual([]);
    expect(s.players.c).toBeUndefined();
  });

  it('backfills a freed half with the first queued human', () => {
    let s = run(createInitialState(T0), join('a'), join('b'), join('c'));
    s = reduce(s, { type: 'disconnect', playerId: 'a', now: T0 });
    expect(slotOf(s, 'c')).toBe(0);
    expect(s.queue).toEqual([]);
  });

  it('backfills a freed half with a bot when nobody waits', () => {
    let s = run(createInitialState(T0), join('a'));
    s = reduce(s, { type: 'disconnect', playerId: 'a', now: T0 });
    expect(s.slots[0].occupant.kind).toBe('bot');
  });

  it('does not change the rally when a player leaves mid-rally', () => {
    let s = run(createInitialState(T0), join('a'));
    const rally = s.rally;
    s = reduce(s, { type: 'leave', playerId: 'a', now: T0 + 999 });
    expect(s.rally).toEqual(rally);
  });
});

describe('spectator points', () => {
  it('queued spectators earn 1 point per tick, capped', () => {
    let s = run(createInitialState(T0), join('a'), join('b'), join('c'));
    s = run(s, ...ticks(5));
    expect(s.players.c?.points).toBe(5);
    expect(s.players.a?.points).toBe(0);
    s = run(s, ...ticks(100));
    expect(s.players.c?.points).toBe(MAX_SPECTATOR_POINTS);
  });
});

describe('hazards', () => {
  const ready = () => run(createInitialState(T0), join('a'), join('b'), join('c'), ...ticks(30));

  it('rejects players who are not queued spectators', () => {
    expect(validateHazard(ready(), 'a', 'tilt', 1, T0)).toBe('notInSlot');
    expect(validateHazard(ready(), 'nobody', 'tilt', 1, T0)).toBe('notInSlot');
  });

  it('rejects insufficient points', () => {
    const s = run(createInitialState(T0), join('a'), join('b'), join('c'), ...ticks(5));
    expect(validateHazard(s, 'c', 'tilt', 0, T0)).toBe('insufficientPoints');
  });

  it('deducts points and starts the half cooldown', () => {
    const s = reduce(ready(), { type: 'hazard', playerId: 'c', kind: 'tilt', target: 0, now: T0 });
    expect(s.players.c?.points).toBe(30 - HAZARD_COST.tilt);
    expect(s.slots[0].hazardCooldownUntil).toBe(T0 + 5000);
    expect(validateHazard(s, 'c', 'tilt', 0, T0 + 4999)).toBe('cooldown');
    expect(validateHazard(s, 'c', 'tilt', 0, T0 + 5000)).toBeNull();
    expect(validateHazard(s, 'c', 'tilt', 1, T0 + 1)).toBeNull();
    expect(validateHazard(s, 'c', 'invertGravity', 1, T0 + 1)).toBe('insufficientPoints');
  });

  it('ignores an invalid hazard event', () => {
    const s = ready();
    expect(reduce(s, { type: 'hazard', playerId: 'a', kind: 'tilt', target: 1, now: T0 })).toBe(s);
  });
});

describe('score and cabinet', () => {
  it('stores rally points per slot', () => {
    const s = reduce(createInitialState(T0), { type: 'score', slot: 1, rallyPoints: 350 });
    expect(s.slots[1].rallyPoints).toBe(350);
  });

  it('tracks the cabinet connection', () => {
    const s = reduce(createInitialState(T0), { type: 'cabinet', connected: true });
    expect(s.cabinetConnected).toBe(true);
  });
});
