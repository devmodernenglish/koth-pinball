import { getCurrentScope, markRaw, onScopeDispose, ref, shallowRef } from 'vue';
import type { FlipperSide, SlotIndex } from '@koth/shared';
import { FIXED_STEP_MS, MAX_STEPS_PER_FRAME, TABLE_HEIGHT, TABLE_WIDTH } from '@/physics/constants';
import { readTheme, renderStatic, renderTable, type TableTheme } from '@/physics/render';
import { PinballTable } from '@/physics/table';

const MANUAL_OVERRIDE_MS = 15000;

type KeyBinding = { slot: SlotIndex; side: FlipperSide | 'plunger' };
const KEYS: Record<string, KeyBinding> = {
  a: { slot: 0, side: 'left' },
  d: { slot: 0, side: 'right' },
  s: { slot: 0, side: 'plunger' },
  j: { slot: 1, side: 'left' },
  l: { slot: 1, side: 'right' },
  k: { slot: 1, side: 'plunger' },
};

/**
 * Owns the single Matter.js table and its fixed-timestep loop (FR-C1, FR-C7).
 * Matter objects stay in plain (raw) variables; only primitives are reactive.
 */
export function usePinballWorld(options: { keyboard?: boolean } = {}) {
  const table = markRaw(new PinballTable());
  const ballHalf = ref<SlotIndex | null>(null);
  const hasBall = ref(false);
  const rallyPoints = ref<[number, number]>([0, 0]);
  const stalemate = ref(false);
  const fps = ref(60);
  const canvas = shallowRef<HTMLCanvasElement | null>(null);
  const manualUntil: Record<SlotIndex, number> = { 0: 0, 1: 0 };

  let theme: TableTheme | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let staticLayer: HTMLCanvasElement | null = null;
  let scale = 1;
  let dpr = 1;
  let raf = 0;
  let last = performance.now();
  let accumulator = 0;
  let fpsFrames = 0;
  let fpsSince = last;

  table.on('score', () => (rallyPoints.value = [...table.rallyPoints]));

  function frame(now: number): void {
    accumulator += Math.min(now - last, 250);
    last = now;
    let steps = 0;
    while (accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      table.step();
      accumulator -= FIXED_STEP_MS;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // drop time rather than spiral

    if (ballHalf.value !== table.ballHalf) ballHalf.value = table.ballHalf;
    if (hasBall.value !== (table.ball !== null)) hasBall.value = table.ball !== null;
    if (stalemate.value !== table.isStalemate) stalemate.value = table.isStalemate;
    if (rallyPoints.value[0] !== table.rallyPoints[0] || rallyPoints.value[1] !== table.rallyPoints[1]) {
      rallyPoints.value = [...table.rallyPoints];
    }

    if (ctx && theme) {
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      renderTable(ctx, table, theme, { activeHalf: table.ballHalf, stalemate: table.isStalemate }, staticLayer ?? undefined);
    }

    fpsFrames += 1;
    if (now - fpsSince >= 500) {
      fps.value = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
    }
    raf = requestAnimationFrame(frame);
  }

  function resize(): void {
    const el = canvas.value;
    if (!el) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = el.clientWidth;
    // Before layout the canvas can be 0 wide; a 0×0 static layer makes drawImage throw and kills the loop.
    // The ResizeObserver calls back once it has a real size.
    if (width === 0) {
      staticLayer = null;
      return;
    }
    scale = width / TABLE_WIDTH;
    el.width = Math.round(width * dpr);
    el.height = Math.round(TABLE_HEIGHT * scale * dpr);

    // Walls never move: draw them once per resize into an offscreen layer.
    staticLayer = document.createElement('canvas');
    staticLayer.width = el.width;
    staticLayer.height = el.height;
    const layerCtx = staticLayer.getContext('2d');
    if (layerCtx && theme) {
      layerCtx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      renderStatic(layerCtx, table, theme);
    }
  }

  /** Binds the renderer to a canvas. The canvas sizes itself with CSS aspect-ratio. */
  function attach(el: HTMLCanvasElement): () => void {
    canvas.value = el;
    ctx = el.getContext('2d');
    theme = readTheme(el);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => {
      observer.disconnect();
      if (canvas.value === el) {
        canvas.value = null;
        ctx = null;
      }
    };
  }

  function input(slot: SlotIndex, side: FlipperSide | 'plunger', pressed: boolean): void {
    if (side === 'plunger') table.setPlunger(slot, pressed);
    else table.setFlipper(slot, side, pressed);
  }

  function releaseSlot(slot: SlotIndex): void {
    table.setFlipper(slot, 'left', false);
    table.setFlipper(slot, 'right', false);
    table.setPlunger(slot, false);
  }

  const isManual = (slot: SlotIndex): boolean => performance.now() < manualUntil[slot];

  function onKey(event: KeyboardEvent, pressed: boolean): void {
    const binding = KEYS[event.key.toLowerCase()];
    if (!binding || (event.target instanceof HTMLInputElement)) return;
    if (event.repeat) return;
    manualUntil[binding.slot] = performance.now() + MANUAL_OVERRIDE_MS;
    input(binding.slot, binding.side, pressed);
  }
  const keyDown = (e: KeyboardEvent): void => onKey(e, true);
  const keyUp = (e: KeyboardEvent): void => onKey(e, false);

  if (options.keyboard) {
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
  }
  raf = requestAnimationFrame(frame);

  function dispose(): void {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
  }
  if (getCurrentScope()) onScopeDispose(dispose);

  return { table, ballHalf, hasBall, rallyPoints, stalemate, fps, attach, input, releaseSlot, isManual, dispose };
}

export type PinballWorld = ReturnType<typeof usePinballWorld>;
