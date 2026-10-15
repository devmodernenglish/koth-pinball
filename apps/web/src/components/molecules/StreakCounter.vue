<script setup lang="ts">
import PlayerTag from '../atoms/PlayerTag.vue';
import ScoreDigit from '../atoms/ScoreDigit.vue';

interface Props {
  name: string;
  streak: number;
  team: 'a' | 'b' | 'neutral';
}

defineProps<Props>();
</script>

<template>
  <div :class="['streak-counter', `streak-counter--${team}`]">
    <span class="streak-counter__crown" aria-hidden="true">♛</span>
    <span class="streak-counter__title">King of the Hill</span>
    <PlayerTag :name="name" :team="team" />
    <ScoreDigit :value="streak" size="lg" />
    <span class="streak-counter__unit">{{ streak === 1 ? 'win' : 'wins' }} in a row</span>
  </div>
</template>

<style lang="scss" scoped>
.streak-counter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: spacing(sm) spacing(md);

  &__crown {
    font-size: font-size(xl);
    color: color(primary);
    text-shadow: 0 0 spacing(md) color(primary);
  }

  &__title {
    @include display-text(lg);
  }

  &__unit {
    color: color(text-muted);
    font-size: font-size(sm);
  }
}
</style>
