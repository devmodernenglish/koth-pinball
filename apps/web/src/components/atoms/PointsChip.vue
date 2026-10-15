<script setup lang="ts">
interface Props {
  points: number;
  max?: number;
}

withDefaults(defineProps<Props>(), { max: 0 });
</script>

<template>
  <span :class="['points-chip', { 'points-chip--full': max > 0 && points >= max }]">
    <span class="points-chip__icon" aria-hidden="true">★</span>
    <span class="points-chip__value">{{ points }}</span>
    <span v-if="max > 0" class="points-chip__max">/ {{ max }}</span>
  </span>
</template>

<style lang="scss" scoped>
.points-chip {
  display: inline-flex;
  align-items: baseline;
  gap: spacing(xs);
  padding: spacing(xxs) spacing(sm);
  border-radius: radius(pill);
  background: color(surface-raised);
  border: border-width(hairline) solid color(border);
  font-variant-numeric: tabular-nums;

  &__icon {
    color: color(primary);
  }

  &__value {
    font-family: font(display);
    font-weight: 800;
  }

  &__max {
    font-size: font-size(xs);
    color: color(text-muted);
  }

  &--full {
    border-color: color(primary);
  }
}
</style>
