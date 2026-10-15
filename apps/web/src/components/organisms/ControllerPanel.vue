<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  HAZARD_COST,
  HAZARD_LABELS,
  MAX_SPECTATOR_POINTS,
  SLOT_LABELS,
  type HazardKind,
  type InputSide,
  type SlotIndex,
} from '@koth/shared';
import { useGameStore } from '@/stores/game';
import { useSocket } from '@/composables/useSocket';
import JoinForm from '../molecules/JoinForm.vue';
import FlipperPad from '../molecules/FlipperPad.vue';
import HazardPicker, { type HazardOption, type HazardTarget } from '../molecules/HazardPicker.vue';
import PointsChip from '../atoms/PointsChip.vue';
import ScoreDigit from '../atoms/ScoreDigit.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import BaseButton from '../atoms/BaseButton.vue';

const NAME_KEY = 'koth:name';
const TOAST_MS = 3000;

const store = useGameStore();
const socket = useSocket();

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

const joined = ref(false);
const savedName = readName();

function join(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage is a convenience only
  }
  joined.value = true;
  socket.connect({ type: 'hello', role: 'controller', name });
}

function leave(): void {
  socket.disconnect();
  joined.value = false;
}

const mySlot = computed(() => store.mySlot);
const team = computed(() => (mySlot.value === 1 ? 'b' : 'a'));
const mySlotState = computed(() => (mySlot.value === null ? null : store.game?.slots[mySlot.value] ?? null));

// Input: touch pads and keyboard both funnel into one sender (FR-P2).
const pressed = ref<Record<InputSide, boolean>>({ left: false, right: false, plunger: false });

function sendInput(side: InputSide, isPressed: boolean): void {
  if (pressed.value[side] === isPressed) return;
  pressed.value = { ...pressed.value, [side]: isPressed };
  socket.send({ type: 'input', side, pressed: isPressed });
  if (isPressed && side !== 'plunger') navigator.vibrate?.(12);
}

const KEY_SIDES: Record<string, InputSide> = { z: 'left', '/': 'right', ' ': 'plunger' };

function onKey(event: KeyboardEvent, isPressed: boolean): void {
  if (mySlot.value === null || event.target instanceof HTMLInputElement) return;
  const side = KEY_SIDES[event.key.toLowerCase()];
  if (!side) return;
  event.preventDefault();
  sendInput(side, isPressed);
}
const keyDown = (e: KeyboardEvent): void => onKey(e, true);
const keyUp = (e: KeyboardEvent): void => onKey(e, false);

// Losing your half releases everything so no input is left "held".
watch(mySlot, () => {
  pressed.value = { left: false, right: false, plunger: false };
});

// Hazards (FR-P3).
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

const hazardOptions: HazardOption[] = (Object.keys(HAZARD_COST) as HazardKind[]).map((kind) => ({
  kind,
  label: HAZARD_LABELS[kind],
  cost: HAZARD_COST[kind],
}));

const hazardTargets = computed<HazardTarget[]>(() =>
  (store.game?.slots ?? []).map((s) => ({
    slot: s.index,
    label: SLOT_LABELS[s.index],
    name: s.occupant.name,
    cooldownSeconds: Math.max(0, Math.ceil((s.hazardCooldownUntil - now.value) / 1000)),
  })),
);

function fireHazard(kind: HazardKind, target: SlotIndex): void {
  socket.send({ type: 'hazard', kind, target });
}

// Error toasts.
const toast = computed(() => store.toast);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
watch(toast, (t) => {
  if (!t) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => store.clearToast(), TOAST_MS);
});

onMounted(() => {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  clock = setInterval(() => (now.value = Date.now()), 250);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  if (clock) clearInterval(clock);
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <div class="controller-panel">
    <div v-if="!joined" class="controller-panel__center">
      <JoinForm :initial-name="savedName" @submit="join" />
    </div>

    <div v-else-if="!store.connected || !store.me" class="controller-panel__center">
      <StatusBadge label="Connecting…" tone="warn" />
      <p class="controller-panel__muted">Looking for the cabinet on this network.</p>
    </div>

    <div v-else-if="mySlot !== null" :class="['controller-panel__play', `controller-panel__play--${team}`]">
      <div class="controller-panel__banner">
        <span class="controller-panel__side">You are {{ SLOT_LABELS[mySlot] }}</span>
        <ScoreDigit label="Streak" :value="mySlotState?.streak ?? 0" size="md" />
        <ScoreDigit label="Rally" :value="mySlotState?.rallyPoints ?? 0" size="md" />
      </div>
      <div class="controller-panel__pads">
        <FlipperPad
          label="Left"
          hint="Z"
          :team="team"
          :pressed="pressed.left"
          @press="sendInput('left', true)"
          @release="sendInput('left', false)"
        />
        <FlipperPad
          label="Right"
          hint="/"
          :team="team"
          :pressed="pressed.right"
          @press="sendInput('right', true)"
          @release="sendInput('right', false)"
        />
      </div>
      <div class="controller-panel__plunger">
        <FlipperPad
          label="Hold to launch"
          hint="Space"
          :team="team"
          :pressed="pressed.plunger"
          @press="sendInput('plunger', true)"
          @release="sendInput('plunger', false)"
        />
      </div>
    </div>

    <div v-else class="controller-panel__wait">
      <div class="controller-panel__queue">
        <span class="controller-panel__muted">Queue position</span>
        <ScoreDigit :value="store.queuePosition ?? 0" size="lg" />
        <PointsChip :points="store.me.points" :max="MAX_SPECTATOR_POINTS" />
        <span class="controller-panel__muted">You earn ★1 per second while you wait.</span>
      </div>
      <HazardPicker :points="store.me.points" :options="hazardOptions" :targets="hazardTargets" @fire="fireHazard" />
    </div>

    <div v-if="joined" class="controller-panel__footer">
      <span v-if="store.me" class="controller-panel__muted">Playing as {{ store.me.name }}</span>
      <BaseButton variant="ghost" size="sm" @click="leave">Leave</BaseButton>
    </div>

    <Transition name="controller-panel__toast">
      <div v-if="toast" :key="toast.id" class="controller-panel__toast" role="alert">{{ toast.message }}</div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.controller-panel {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: spacing(md);
  min-height: 0;

  &__center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: spacing(md);
    text-align: center;
  }

  &__muted {
    margin: 0;
    color: color(text-muted);
    font-size: font-size(sm);
  }

  &__play {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: spacing(md);
    min-height: 0;
  }

  &__banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: spacing(md);
    padding: spacing(sm) spacing(md);
    border-radius: radius(lg);
    border: border-width(thin) solid color(player-a);
    background: color(player-a-soft);
  }

  &__play--b &__banner {
    border-color: color(player-b);
    background: color(player-b-soft);
  }

  &__side {
    @include display-text(lg);
  }

  &__pads {
    flex: 3;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: spacing(md);
    min-height: 0;
  }

  &__plunger {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  &__wait {
    display: flex;
    flex-direction: column;
    gap: spacing(md);
  }

  &__queue {
    @include card;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: spacing(sm);
    text-align: center;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: spacing(sm);
  }

  &__toast {
    position: fixed;
    left: 50%;
    bottom: spacing(xl);
    transform: translateX(-50%);
    z-index: z(toast);
    padding: spacing(sm) spacing(lg);
    border-radius: radius(pill);
    background: color(danger);
    color: color('white');
    font-weight: 800;
    text-align: center;
  }
}

.controller-panel__toast-enter-active,
.controller-panel__toast-leave-active {
  transition: opacity duration(base);
}

.controller-panel__toast-enter-from,
.controller-panel__toast-leave-to {
  opacity: 0;
}
</style>
