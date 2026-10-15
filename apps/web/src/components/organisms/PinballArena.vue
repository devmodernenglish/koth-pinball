<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { HAZARD_LABELS, SLOT_LABELS, otherSlot, type SlotIndex, type SlotOccupant } from '@koth/shared';
import { useGameStore } from '@/stores/game';
import { useSocket } from '@/composables/useSocket';
import { usePinballWorld } from '@/composables/usePinballWorld';
import { useBotController } from '@/composables/useBotController';
import { useHazards } from '@/composables/useHazards';
import MatchHeader, { type HeaderSide } from '../molecules/MatchHeader.vue';
import StreakCounter from '../molecules/StreakCounter.vue';
import StatusBadge from '../atoms/StatusBadge.vue';
import PinballTable, { type TableBanner } from './PinballTable.vue';

const SERVE_DELAY_MS = 1000;
const OFFLINE_SERVE_DELAY_MS = 1500;
const SCORE_FLUSH_MS = 550; // per slot; the server accepts 2/s per slot, 4/s total
const CHALLENGER_BANNER_MS = 2200;
const HAZARD_ICONS = { tilt: '↔', extraBumper: '◉', invertGravity: '⇅' } as const;

const store = useGameStore();
const socket = useSocket();
const world = usePinballWorld({ keyboard: true });
const hazards = useHazards(world);

const isBotSlot = (slot: SlotIndex): boolean =>
  !store.connected || !store.game || store.game.slots[slot].occupant.kind === 'bot';
useBotController(world, isBotSlot);

// Offline fallback so the cabinet keeps playing even without the server.
const offlineStreaks = reactive<[number, number]>([0, 0]);
let serveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleServe(slot: SlotIndex, delay: number): void {
  if (serveTimer) clearTimeout(serveTimer);
  serveTimer = setTimeout(() => {
    serveTimer = null;
    if (!world.table.ball) world.table.serve(slot);
  }, delay);
}

socket.on('serve', ({ slot }) => {
  // On (re)connect the server announces the serving slot; ignore it while a ball is in play.
  if (!world.table.ball) scheduleServe(slot, SERVE_DELAY_MS);
});
socket.on('input', ({ slot, side, pressed }) => world.input(slot, side, pressed));
socket.on('hazard', ({ kind, target, durationMs }) => hazards.apply(kind, target, durationMs));

world.table.on('drain', (loser) => {
  if (store.connected) {
    socket.send({ type: 'drain', loserSlot: loser });
  } else {
    offlineStreaks[otherSlot(loser)] += 1;
    offlineStreaks[loser] = 0;
    scheduleServe(loser, OFFLINE_SERVE_DELAY_MS);
  }
});

// Rally points: send the latest total per slot at most every SCORE_FLUSH_MS.
const sentScores: [number, number] = [0, 0];
const scoreTimer = setInterval(() => {
  if (!store.connected) return;
  for (const slot of [0, 1] as const) {
    const points = world.table.rallyPoints[slot];
    if (points !== sentScores[slot]) {
      sentScores[slot] = points;
      socket.send({ type: 'score', slot, rallyPoints: points });
    }
  }
}, SCORE_FLUSH_MS);
world.table.on('serve', () => {
  sentScores[0] = 0;
  sentScores[1] = 0;
});

// FR-U3: flash NEXT CHALLENGER when a new human takes a half.
const challengerBanners = ref<TableBanner[]>([]);
const occupantKey = (o: SlotOccupant): string => (o.kind === 'human' ? `h:${o.playerId}` : `b:${o.botId}`);

watch(
  () => store.game?.slots.map((s) => s.occupant),
  (next, prev) => {
    if (!next) return;
    next.forEach((occupant, i) => {
      const slot = i as SlotIndex;
      const before = prev?.[slot];
      if (before && occupantKey(before) === occupantKey(occupant)) return;
      world.releaseSlot(slot);
      world.table.rallyPoints[slot] = 0;
      if (!before || occupant.kind !== 'human') return;
      const banner: TableBanner = {
        id: `challenger-${occupantKey(occupant)}-${Date.now()}`,
        slot,
        title: 'Next challenger',
        subtitle: `${occupant.name} takes the ${SLOT_LABELS[slot].toLowerCase()} half`,
        tone: 'challenger',
        durationMs: CHALLENGER_BANNER_MS,
      };
      challengerBanners.value = [...challengerBanners.value, banner];
      setTimeout(() => {
        challengerBanners.value = challengerBanners.value.filter((b) => b.id !== banner.id);
      }, CHALLENGER_BANNER_MS);
    });
  },
);

const banners = computed<TableBanner[]>(() => [
  ...hazards.active.value.map((h) => ({
    id: `hazard-${h.id}`,
    slot: h.target,
    title: `${HAZARD_ICONS[h.kind]} ${HAZARD_LABELS[h.kind]}`,
    subtitle: 'Hazard active',
    tone: 'hazard' as const,
    durationMs: h.durationMs,
  })),
  ...challengerBanners.value,
]);

const OFFLINE_NAMES: Record<SlotIndex, string> = { 0: 'Bot Lefty', 1: 'Bot Righty' };

function headerSide(slot: SlotIndex): HeaderSide {
  const s = store.connected ? store.game?.slots[slot] : undefined;
  return {
    name: s?.occupant.name ?? OFFLINE_NAMES[slot],
    kind: s?.occupant.kind ?? 'bot',
    streak: s ? s.streak : offlineStreaks[slot],
    rallyPoints: world.rallyPoints.value[slot],
  };
}

const left = computed(() => headerSide(0));
const right = computed(() => headerSide(1));
const king = computed(() => {
  const slot: SlotIndex = right.value.streak > left.value.streak ? 1 : 0;
  const side = slot === 0 ? left.value : right.value;
  return { name: side.name, streak: side.streak, team: slot === 0 ? ('a' as const) : ('b' as const) };
});
const queueCount = computed(() => store.game?.queue.length ?? 0);

let offlineKick: ReturnType<typeof setTimeout> | null = null;
onMounted(() => {
  socket.connect({ type: 'hello', role: 'cabinet' });
  // Attract mode starts even if the server never answers.
  offlineKick = setTimeout(() => {
    if (!world.table.ball && !serveTimer) world.table.serve(0);
  }, OFFLINE_SERVE_DELAY_MS * 2);
});

watch(
  () => store.connected,
  (connected) => {
    if (!connected && !world.table.ball && !serveTimer) scheduleServe(0, OFFLINE_SERVE_DELAY_MS);
  },
);

onBeforeUnmount(() => {
  clearInterval(scoreTimer);
  if (serveTimer) clearTimeout(serveTimer);
  if (offlineKick) clearTimeout(offlineKick);
});
</script>

<template>
  <section class="pinball-arena">
    <StreakCounter class="pinball-arena__king" :name="king.name" :streak="king.streak" :team="king.team" />
    <MatchHeader
      :left="left"
      :right="right"
      :queue-count="queueCount"
      :active-half="world.ballHalf.value"
      :stalemate="world.stalemate.value"
    />
    <PinballTable :world="world" :banners="banners" />
    <footer class="pinball-arena__footer">
      <StatusBadge :label="store.connected ? 'Server live' : 'Offline attract mode'" :tone="store.connected ? 'live' : 'off'" />
      <span class="pinball-arena__keys">Keys: A / D · S launch (left) — J / L · K launch (right)</span>
      <StatusBadge :label="`${world.fps.value} fps`" :tone="world.fps.value >= 55 ? 'human' : 'warn'" />
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.pinball-arena {
  display: flex;
  flex-direction: column;
  gap: spacing(sm);
  min-width: 0;

  &__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: spacing(sm);
  }

  &__keys {
    color: color(text-muted);
    font-size: font-size(xs);
  }
}
</style>
