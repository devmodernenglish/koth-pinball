<script setup lang="ts">
export type BadgeTone = 'human' | 'bot' | 'live' | 'warn' | 'off';

interface Props {
  label: string;
  tone?: BadgeTone;
}

withDefaults(defineProps<Props>(), { tone: 'off' });
</script>

<template>
  <span :class="['status-badge', `status-badge--${tone}`]">{{ label }}</span>
</template>

<style lang="scss" scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: spacing(xxs) spacing(sm);
  border-radius: radius(pill);
  border: border-width(hairline) solid currentColor;
  font-family: font(display);
  font-size: font-size(xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;

  &--human {
    color: color(success);
  }

  &--bot {
    color: color(text-muted);
  }

  &--live {
    color: color(primary);
  }

  &--warn {
    color: color(warning);
  }

  &--off {
    color: color(danger);
  }
}
</style>
