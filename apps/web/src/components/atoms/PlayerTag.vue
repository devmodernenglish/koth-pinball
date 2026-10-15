<script setup lang="ts">
export type Team = 'a' | 'b' | 'neutral';

interface Props {
  name: string;
  team?: Team;
}

withDefaults(defineProps<Props>(), { team: 'neutral' });
</script>

<template>
  <span :class="['player-tag', `player-tag--${team}`]">
    <span class="player-tag__dot" aria-hidden="true" />
    <span class="player-tag__name">{{ name }}</span>
  </span>
</template>

<style lang="scss" scoped>
.player-tag {
  display: inline-flex;
  align-items: center;
  gap: spacing(xs);
  min-width: 0;
  font-weight: 800;

  &__dot {
    flex: none;
    width: spacing(sm);
    height: spacing(sm);
    border-radius: radius(round);
    background: color(text-muted);
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &--a &__dot {
    background: color(player-a);
    box-shadow: 0 0 spacing(sm) color(player-a);
  }

  &--b &__dot {
    background: color(player-b);
    box-shadow: 0 0 spacing(sm) color(player-b);
  }
}
</style>
