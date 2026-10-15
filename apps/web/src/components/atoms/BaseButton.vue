<script setup lang="ts">
export type ButtonVariant = 'primary' | 'ghost' | 'player-a' | 'player-b' | 'hazard';
export type ButtonSize = 'sm' | 'md' | 'pad';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit';
  disabled?: boolean;
  block?: boolean;
  active?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  block: false,
  active: false,
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'base-button',
      `base-button--${variant}`,
      `base-button--${size}`,
      { 'base-button--block': block, 'base-button--active': active },
    ]"
  >
    <slot />
  </button>
</template>

<style lang="scss" scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: spacing(sm);
  border: border-width(thin) solid transparent;
  border-radius: radius(md);
  font-family: font(display);
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    transform duration(fast),
    box-shadow duration(fast),
    background duration(fast);
  @include focus-ring;
  @include no-touch-select;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--sm {
    padding: spacing(xs) spacing(sm);
    font-size: font-size(xs);
  }

  &--md {
    padding: spacing(sm) spacing(lg);
    font-size: font-size(sm);
  }

  &--pad {
    padding: spacing(lg);
    font-size: font-size(pad);
    border-radius: radius(lg);
    width: 100%;
    height: 100%;
  }

  &--block {
    width: 100%;
  }

  &--primary {
    background: color(primary);
    color: color(primary-ink);
  }

  &--ghost {
    background: transparent;
    border-color: color(border);
    color: color(text);
  }

  &--player-a {
    background: color(player-a-soft);
    border-color: color(player-a);
    color: color(text);
  }

  &--player-b {
    background: color(player-b-soft);
    border-color: color(player-b);
    color: color(text);
  }

  &--hazard {
    background: color(surface-raised);
    border-color: color(hazard);
    color: color(text);
  }

  &--active {
    transform: scale(0.97);

    &.base-button--player-a {
      background: color(player-a);
      @include glow(player-a);
    }

    &.base-button--player-b {
      background: color(player-b);
      @include glow(player-b);
    }

    &.base-button--ghost,
    &.base-button--primary,
    &.base-button--hazard {
      @include glow(primary);
    }
  }
}
</style>
