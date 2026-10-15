import { shallowRef } from 'vue';
import type { HazardKind, SlotIndex } from '@koth/shared';
import type { PinballWorld } from './usePinballWorld';

export interface HazardBanner {
  id: number;
  kind: HazardKind;
  target: SlotIndex;
  durationMs: number;
}

/** Applies hazards to the table and exposes the active ones for banners (FR-C8). */
export function useHazards(world: PinballWorld) {
  const active = shallowRef<HazardBanner[]>([]);
  const durations = new Map<number, number>();

  world.table.on('hazards', (list) => {
    active.value = list.map((h) => ({ id: h.id, kind: h.kind, target: h.target, durationMs: durations.get(h.id) ?? 5000 }));
  });

  function apply(kind: HazardKind, target: SlotIndex, durationMs: number): void {
    const before = world.table.hazards.length;
    world.table.applyHazard(kind, target, durationMs);
    const added = world.table.hazards[before];
    if (added) durations.set(added.id, durationMs);
    active.value = world.table.hazards.map((h) => ({
      id: h.id,
      kind: h.kind,
      target: h.target,
      durationMs: durations.get(h.id) ?? durationMs,
    }));
  }

  return { active, apply };
}
