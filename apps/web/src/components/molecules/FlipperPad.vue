<script setup lang="ts">
import { ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';

interface Props {
  label: string;
  hint?: string;
  team: 'a' | 'b';
  /** Externally driven pressed state, e.g. from the keyboard. */
  pressed?: boolean;
}

const props = withDefaults(defineProps<Props>(), { hint: '', pressed: false });
const emit = defineEmits<{
  (e: 'press'): void;
  (e: 'release'): void;
}>();

const down = ref(false);

function press(event: PointerEvent): void {
  if (down.value) return;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  down.value = true;
  emit('press');
}

function release(): void {
  if (!down.value) return;
  down.value = false;
  emit('release');
}
</script>

<template>
  <div class="flipper-pad">
    <BaseButton
      :variant="props.team === 'a' ? 'player-a' : 'player-b'"
      size="pad"
      :active="down || pressed"
      @pointerdown.prevent="press"
      @pointerup="release"
      @pointercancel="release"
      @lostpointercapture="release"
      @contextmenu.prevent
    >
      <span class="flipper-pad__content">
        <span class="flipper-pad__label">{{ label }}</span>
        <span v-if="hint" class="flipper-pad__hint">{{ hint }}</span>
      </span>
    </BaseButton>
  </div>
</template>

<style lang="scss" scoped>
.flipper-pad {
  display: flex;
  min-height: size(pad-min);
  @include no-touch-select;

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: spacing(xs);
    pointer-events: none;
  }

  &__hint {
    font-family: font(mono);
    font-size: font-size(xs);
    color: color(text-muted);
    text-transform: none;
  }
}
</style>
