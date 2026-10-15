import Matter from 'matter-js';
import { getCurrentScope, onScopeDispose } from 'vue';
import type { SlotIndex } from '@koth/shared';
import { BotBrain } from '@/physics/botBrain';
import type { PinballWorld } from './usePinballWorld';

/** Runs a bot for every half that has no human (FR-B1..FR-B4). */
export function useBotController(world: PinballWorld, isBotSlot: (slot: SlotIndex) => boolean) {
  const brains = ([0, 1] as const).map(
    (slot) => new BotBrain(world.table, slot, () => isBotSlot(slot) && !world.isManual(slot)),
  );
  const onBeforeUpdate = (): void => brains.forEach((b) => b.update());
  Matter.Events.on(world.table.engine, 'beforeUpdate', onBeforeUpdate);

  function dispose(): void {
    Matter.Events.off(world.table.engine, 'beforeUpdate', onBeforeUpdate);
  }
  if (getCurrentScope()) onScopeDispose(dispose);
  return { dispose };
}
