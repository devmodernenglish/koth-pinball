<script setup lang="ts">
import type { SlotIndex } from '@koth/shared';
import PlayerTag from '../atoms/PlayerTag.vue';
import ScoreDigit from '../atoms/ScoreDigit.vue';
import StatusBadge from '../atoms/StatusBadge.vue';

export interface HeaderSide {
  name: string;
  kind: 'human' | 'bot';
  streak: number;
  rallyPoints: number;
}

interface Props {
  left: HeaderSide;
  right: HeaderSide;
  queueCount: number;
  activeHalf: SlotIndex | null;
  stalemate: boolean;
}

defineProps<Props>();
</script>

<template>
  <header class="match-header">
    <div
      v-for="(side, i) in [left, right]"
      :key="i"
      :class="[
        'match-header__side',
        `match-header__side--${i === 0 ? 'a' : 'b'}`,
        { 'match-header__side--active': activeHalf === i },
      ]"
    >
      <div class="match-header__identity">
        <PlayerTag :name="side.name" :team="i === 0 ? 'a' : 'b'" />
        <StatusBadge :label="side.kind === 'human' ? 'Human' : 'Bot'" :tone="side.kind" />
      </div>
      <div class="match-header__scores">
        <ScoreDigit label="Streak" :value="side.streak" size="lg" />
        <ScoreDigit label="Rally" :value="side.rallyPoints" :digits="5" size="md" />
      </div>
    </div>

    <div class="match-header__centre">
      <span class="match-header__vs">VS</span>
      <StatusBadge v-if="stalemate" label="Stalemate breaker" tone="warn" />
      <StatusBadge v-else :label="`${queueCount} in queue`" tone="live" />
    </div>
  </header>
</template>

<style lang="scss" scoped>
.match-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: spacing(sm);

  &__side {
    @include card;
    grid-row: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: spacing(sm);
    padding: spacing(sm) spacing(md);
    transition: box-shadow duration(base), border-color duration(base);

    &--a {
      grid-column: 1;
    }

    &--b {
      grid-column: 3;
      flex-direction: row-reverse;
    }

    &--a.match-header__side--active {
      border-color: color(player-a);
      @include glow(player-a-soft);
    }

    &--b.match-header__side--active {
      border-color: color(player-b);
      @include glow(player-b-soft);
    }
  }

  &__identity {
    display: flex;
    flex-direction: column;
    gap: spacing(xs);
    min-width: 0;
    font-size: font-size(lg);
  }

  &__side--b &__identity {
    align-items: flex-end;
  }

  &__scores {
    display: flex;
    gap: spacing(md);
  }

  &__centre {
    grid-row: 1;
    grid-column: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: spacing(xs);
  }

  &__vs {
    @include display-text(xl);
    color: color(primary);
  }
}
</style>
