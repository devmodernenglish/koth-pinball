<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { SlotIndex } from '@koth/shared';
import type { PinballWorld } from '@/composables/usePinballWorld';

export interface TableBanner {
  id: string;
  slot: SlotIndex;
  title: string;
  subtitle?: string;
  tone: 'hazard' | 'challenger';
  durationMs: number;
}

interface Props {
  world: PinballWorld;
  banners: TableBanner[];
}

const props = defineProps<Props>();
const canvasEl = ref<HTMLCanvasElement | null>(null);
let detach: (() => void) | null = null;

onMounted(() => {
  if (canvasEl.value) detach = props.world.attach(canvasEl.value);
});
onBeforeUnmount(() => detach?.());

const halves: SlotIndex[] = [0, 1];
</script>

<template>
  <div class="pinball-table">
    <canvas ref="canvasEl" class="pinball-table__canvas" />
    <div class="pinball-table__overlay">
      <div
        v-for="slot in halves"
        :key="slot"
        :class="['pinball-table__half', { 'pinball-table__half--active': world.ballHalf.value === slot }]"
      >
        <TransitionGroup name="pinball-table__banner" tag="div" class="pinball-table__banners">
          <div
            v-for="banner in banners.filter((b) => b.slot === slot)"
            :key="banner.id"
            :class="['pinball-table__banner', `pinball-table__banner--${banner.tone}`]"
            :style="{ '--banner-duration': `${banner.durationMs}ms` }"
          >
            <strong class="pinball-table__banner-title">{{ banner.title }}</strong>
            <span v-if="banner.subtitle" class="pinball-table__banner-subtitle">{{ banner.subtitle }}</span>
            <span class="pinball-table__banner-timer" />
          </div>
        </TransitionGroup>
      </div>
    </div>
    <div v-if="!world.hasBall.value" class="pinball-table__serving">Next ball…</div>
  </div>
</template>

<style lang="scss" scoped>
.pinball-table {
  position: relative;
  width: 100%;
  // Fit the fixed aspect ratio inside the viewport height on the cabinet screen.
  max-width: calc((100dvh - size(arena-chrome)) * 1.25);
  margin-inline: auto;
  aspect-ratio: 1000 / 800;
  border-radius: radius(lg);
  overflow: hidden;
  border: border-width(thin) solid color(border);
  background: color(table-bg);

  &__canvas {
    display: block;
    width: 100%;
    aspect-ratio: 1000 / 800;
  }

  &__overlay {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    pointer-events: none;
    z-index: z(overlay);
  }

  &__half {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 22%;
  }

  &__banners {
    display: flex;
    flex-direction: column;
    gap: spacing(sm);
    align-items: center;
    width: 80%;
  }

  &__banner {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: spacing(xxs);
    width: 100%;
    padding: spacing(sm) spacing(md);
    border-radius: radius(md);
    background: color(overlay);
    border: border-width(thin) solid currentColor;
    overflow: hidden;
    text-align: center;

    &--hazard {
      color: color(hazard);
    }

    &--challenger {
      color: color(primary);
      animation: pinball-table-pulse duration(slow) ease-in-out 3 alternate;
    }
  }

  &__banner-title {
    @include display-text(lg);
  }

  &__banner-subtitle {
    color: color(text);
    font-size: font-size(sm);
  }

  &__banner-timer {
    position: absolute;
    left: 0;
    bottom: 0;
    height: border-width(thick);
    width: 100%;
    background: currentColor;
    transform-origin: left;
    animation: pinball-table-timer var(--banner-duration) linear forwards;
  }

  &__serving {
    position: absolute;
    left: 50%;
    bottom: spacing(md);
    transform: translateX(-50%);
    padding: spacing(xs) spacing(md);
    border-radius: radius(pill);
    background: color(scrim);
    @include display-text(sm);
    color: color(text-muted);
  }
}

.pinball-table__banner-enter-active,
.pinball-table__banner-leave-active {
  transition:
    opacity duration(base),
    transform duration(base);
}

.pinball-table__banner-enter-from,
.pinball-table__banner-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

@keyframes pinball-table-timer {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

@keyframes pinball-table-pulse {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.08);
  }
}
</style>
