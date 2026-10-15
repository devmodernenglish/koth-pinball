<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HazardKind, SlotIndex } from '@koth/shared';
import BaseButton from '../atoms/BaseButton.vue';
import PlayerTag from '../atoms/PlayerTag.vue';
import PointsChip from '../atoms/PointsChip.vue';

export interface HazardOption {
  kind: HazardKind;
  label: string;
  cost: number;
}

export interface HazardTarget {
  slot: SlotIndex;
  label: string;
  name: string;
  cooldownSeconds: number;
}

interface Props {
  points: number;
  options: HazardOption[];
  targets: HazardTarget[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'fire', kind: HazardKind, target: SlotIndex): void }>();

const selected = ref<SlotIndex>(0);
const target = computed(() => props.targets.find((t) => t.slot === selected.value));
const coolingDown = computed(() => (target.value?.cooldownSeconds ?? 0) > 0);
</script>

<template>
  <section class="hazard-picker">
    <header class="hazard-picker__header">
      <h2 class="hazard-picker__title">Hazards</h2>
      <PointsChip :points="points" />
    </header>

    <div class="hazard-picker__targets" role="radiogroup" aria-label="Target half">
      <BaseButton
        v-for="t in targets"
        :key="t.slot"
        :variant="t.slot === 0 ? 'player-a' : 'player-b'"
        :active="selected === t.slot"
        size="sm"
        role="radio"
        :aria-checked="selected === t.slot"
        @click="selected = t.slot"
      >
        <span class="hazard-picker__target">
          <span>{{ t.label }}</span>
          <PlayerTag :name="t.name" :team="t.slot === 0 ? 'a' : 'b'" />
          <span v-if="t.cooldownSeconds > 0" class="hazard-picker__cooldown">{{ t.cooldownSeconds }}s</span>
        </span>
      </BaseButton>
    </div>

    <div class="hazard-picker__options">
      <BaseButton
        v-for="o in options"
        :key="o.kind"
        variant="hazard"
        block
        :disabled="points < o.cost || coolingDown"
        @click="emit('fire', o.kind, selected)"
      >
        <span class="hazard-picker__option">
          <span>{{ o.label }}</span>
          <span class="hazard-picker__cost">★ {{ o.cost }}</span>
        </span>
      </BaseButton>
    </div>
    <p v-if="coolingDown" class="hazard-picker__hint">That half is cooling down…</p>
  </section>
</template>

<style lang="scss" scoped>
.hazard-picker {
  @include card;
  display: flex;
  flex-direction: column;
  gap: spacing(md);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__title {
    @include display-text(md);
    margin: 0;
    color: color(hazard);
  }

  &__targets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: spacing(sm);
  }

  &__target {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: spacing(xxs);
    min-width: 0;
    text-transform: none;
  }

  &__cooldown {
    color: color(warning);
  }

  &__options {
    display: flex;
    flex-direction: column;
    gap: spacing(sm);
  }

  &__option {
    display: flex;
    width: 100%;
    justify-content: space-between;
  }

  &__cost {
    color: color(primary);
  }

  &__hint {
    margin: 0;
    color: color(warning);
    font-size: font-size(sm);
    text-align: center;
  }
}
</style>
