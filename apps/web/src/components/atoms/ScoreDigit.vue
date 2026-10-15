<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  value: number;
  label?: string;
  digits?: number;
  size?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), { label: '', digits: 0, size: 'md' });

const padded = computed(() => {
  const text = String(Math.max(0, Math.floor(props.value)));
  const pad = Math.max(0, props.digits - text.length);
  return { dim: '0'.repeat(pad), lit: text };
});
</script>

<template>
  <span :class="['score-digit', `score-digit--${size}`]">
    <span v-if="label" class="score-digit__label">{{ label }}</span>
    <span class="score-digit__value"><span class="score-digit__dim">{{ padded.dim }}</span>{{ padded.lit }}</span>
  </span>
</template>

<style lang="scss" scoped>
.score-digit {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;

  &__label {
    font-size: font-size(xs);
    color: color(text-muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: spacing(xxs);
  }

  &__value {
    font-family: font(display);
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  &__dim {
    opacity: 0.25;
  }

  &--sm &__value {
    font-size: font-size(md);
  }

  &--md &__value {
    font-size: font-size(lg);
  }

  &--lg &__value {
    font-size: font-size(xxl);
  }
}
</style>
